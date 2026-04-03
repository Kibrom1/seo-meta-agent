import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue", () => ({
  seoQueue: { add: mockQueueAdd },
}));

const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/db", () => ({
  createServiceClient: () => ({ from: mockSupabaseFrom, rpc: mockRpc }),
}));

const mockRpc = vi.fn();

vi.mock("@/lib/crypto", () => ({
  validateHmacSignature: vi.fn().mockReturnValue(true),
  decryptApiKey: vi.fn().mockReturnValue("plaintext-secret"),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProject(overrides = {}) {
  return {
    id: "project-1",
    webhook_secret: "enc:secret",
    token_limit: 100_000,
    stripe_customer_id: null,
    ...overrides,
  };
}

function makeSupabaseChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "insert", "single", "maybeSingle", "update"];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  (chain["single"] as ReturnType<typeof vi.fn>).mockResolvedValue(returnValue);
  (chain["maybeSingle"] as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  return chain;
}

function buildRequest(payload: object, projectId = "project-1") {
  const body = JSON.stringify(payload);
  return new Request(`http://localhost/api/webhook/cms-event?projectId=${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/webhook/cms-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it("returns 400 when projectId is missing", async () => {
    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const req = new Request("http://localhost/api/webhook/cms-event", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/projectId/i);
  });

  it("returns 404 when project is not found", async () => {
    mockSupabaseFrom.mockReturnValue(makeSupabaseChain({ data: null, error: { message: "not found" } }));
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 0 }] });

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const res = await POST(buildRequest({ sys: { type: "Entry", id: "e1" }, fields: {} }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    const chain = makeSupabaseChain({ data: makeProject(), error: null });
    mockSupabaseFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 0 }] });

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const req = new Request("http://localhost/api/webhook/cms-event?projectId=project-1", {
      method: "POST",
      body: "NOT JSON",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when token limit is exceeded", async () => {
    const chain = makeSupabaseChain({ data: makeProject({ token_limit: 100 }), error: null });
    mockSupabaseFrom.mockReturnValue(chain);
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 200 }] }); // over limit

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const payload = { sys: { type: "Entry", id: "e1" }, fields: { title: { "en-US": "T" } } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(429);
  });

  it("enqueues metadata_gen for an Entry without existing seo_title", async () => {
    const project = makeProject();
    const projectChain = makeSupabaseChain({ data: project, error: null });
    const dedupChain = makeSupabaseChain({ data: null, error: null }); // no existing task
    const insertChain = makeSupabaseChain({ data: { id: "task-1" }, error: null });

    mockSupabaseFrom
      .mockReturnValueOnce(projectChain) // project lookup
      .mockReturnValueOnce(dedupChain)   // dedup check
      .mockReturnValueOnce(insertChain); // task insert
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 0 }] });

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const payload = {
      sys: { type: "Entry", id: "entry-1" },
      fields: { title: { "en-US": "My Article" } },
    };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.accepted).toBe(true);
    expect(mockQueueAdd).toHaveBeenCalledWith("metadata_gen", expect.objectContaining({ taskId: "task-1" }));
  });

  it("skips metadata_gen when seo_title already exists (collision avoidance)", async () => {
    const project = makeProject();
    const projectChain = makeSupabaseChain({ data: project, error: null });
    mockSupabaseFrom.mockReturnValue(projectChain);
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 0 }] });

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const payload = {
      sys: { type: "Entry", id: "entry-2" },
      fields: {
        title: { "en-US": "My Article" },
        seo_title: { "en-US": "Already has an SEO title" },
      },
    };
    const res = await POST(buildRequest(payload));
    const json = await res.json();
    expect(json.accepted).toBe(false);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("enqueues alt_text_vision for an Asset", async () => {
    const project = makeProject();
    const projectChain = makeSupabaseChain({ data: project, error: null });
    const dedupChain = makeSupabaseChain({ data: null, error: null });
    const insertChain = makeSupabaseChain({ data: { id: "task-2" }, error: null });

    mockSupabaseFrom
      .mockReturnValueOnce(projectChain)
      .mockReturnValueOnce(dedupChain)
      .mockReturnValueOnce(insertChain);
    mockRpc.mockResolvedValue({ data: [{ total_tokens: 0 }] });

    const { POST } = await import("@/app/api/webhook/cms-event/route");
    const payload = {
      sys: { type: "Asset", id: "asset-1" },
      fields: { file: { "en-US": { url: "//images.ctfassets.net/img.jpg", contentType: "image/jpeg" } } },
    };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(202);
    expect(mockQueueAdd).toHaveBeenCalledWith("alt_text_vision", expect.objectContaining({ taskId: "task-2" }));
  });
});
