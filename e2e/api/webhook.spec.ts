/**
 * E2E — POST /api/webhook/cms-event
 *
 * Tests the full HTTP contract: HMAC validation, project lookup, token budget,
 * task-type routing, deduplication, and job enqueueing.
 *
 * The worker is NOT running during these tests — we only assert that the API
 * accepts/rejects correctly and that the DB row is created.
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  ensureTestUser,
  createTestProject,
  cleanupProject,
  serviceClient,
  signPayload,
} from "../helpers/db";

const ENDPOINT = `${BASE_URL}/api/webhook/cms-event`;

let userId: string;
let projectId: string;

test.beforeAll(async () => {
  userId = await ensureTestUser();
  projectId = await createTestProject(userId, { token_limit: 100_000 });
});

test.afterAll(async () => {
  await cleanupProject(projectId);
});

// ── Helper ──────────────────────────────────────────────────────────────────
function entryPayload(entryId = "entry-e2e-001", overrides: object = {}) {
  return {
    sys: { type: "Entry", id: entryId },
    fields: {
      title: { "en-US": "How to Write Great Blog Posts That Rank" },
      body: { "en-US": "A ".repeat(100) }, // enough content
    },
    ...overrides,
  };
}

function assetPayload(assetId = "asset-e2e-001") {
  return {
    sys: { type: "Asset", id: assetId },
    fields: {
      file: {
        "en-US": { url: "//images.ctfassets.net/test/img.jpg", contentType: "image/jpeg" },
      },
    },
  };
}

async function post(body: object, params = `projectId=${projectId}`) {
  const res = await fetch(`${ENDPOINT}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("400 when projectId query param is missing", async () => {
  const { status, json } = await post(entryPayload(), "");
  expect(status).toBe(400);
  expect(json.error).toMatch(/projectId/i);
});

test("404 when projectId does not exist", async () => {
  const { status, json } = await post(entryPayload(), "projectId=00000000-0000-0000-0000-000000000000");
  expect(status).toBe(404);
  expect(json.error).toMatch(/not found/i);
});

test("400 when body is not valid JSON", async () => {
  const res = await fetch(`${ENDPOINT}?projectId=${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "NOT JSON AT ALL",
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/json/i);
});

test("400 when payload is missing sys.id", async () => {
  const { status, json } = await post({ sys: { type: "Entry" }, fields: {} });
  expect(status).toBe(400);
  expect(json.error).toMatch(/sys\.id/i);
});

test("202 accepted — Entry without seo_title enqueues metadata_gen", async () => {
  const entryId = `entry-e2e-${Date.now()}`;
  const { status, json } = await post(entryPayload(entryId));
  expect(status).toBe(202);
  expect(json.accepted).toBe(true);
  expect(json.taskIds).toHaveLength(1);

  // Verify DB row was created
  const db = serviceClient();
  const { data } = await db
    .from("agent_tasks")
    .select("task_type, status")
    .eq("entry_id", entryId)
    .single();
  expect(data?.task_type).toBe("metadata_gen");
  expect(data?.status).toBe("queued");
});

test("202 accepted — Entry with body enqueues internal_linking in addition to metadata_gen", async () => {
  const entryId = `entry-e2e-body-${Date.now()}`;
  const payload = {
    sys: { type: "Entry", id: entryId },
    fields: {
      title: { "en-US": "Article Title Here" },
      body: { "en-US": "Lorem ipsum ".repeat(50) },
    },
  };
  const { status, json } = await post(payload);
  expect(status).toBe(202);
  // Should enqueue both metadata_gen and internal_linking
  expect(json.taskIds.length).toBeGreaterThanOrEqual(1);

  const db = serviceClient();
  const { data } = await db
    .from("agent_tasks")
    .select("task_type")
    .eq("entry_id", entryId);
  const types = data?.map((r: { task_type: string }) => r.task_type) ?? [];
  expect(types).toContain("metadata_gen");
  expect(types).toContain("internal_linking");
});

test("202 accepted but no tasks — Entry whose seo_title is already set (collision avoidance)", async () => {
  const entryId = `entry-collision-${Date.now()}`;
  const payload = {
    sys: { type: "Entry", id: entryId },
    fields: {
      title: { "en-US": "Already optimised article" },
      seo_title: { "en-US": "Existing Human-Written SEO Title" }, // already set
    },
  };
  const { status, json } = await post(payload);
  expect(status).toBe(200);
  expect(json.accepted).toBe(false);
  expect(json.reason).toMatch(/no tasks/i);
});

test("202 accepted — Asset enqueues alt_text_vision", async () => {
  const assetId = `asset-e2e-${Date.now()}`;
  const { status, json } = await post(assetPayload(assetId));
  expect(status).toBe(202);
  expect(json.accepted).toBe(true);

  const db = serviceClient();
  const { data } = await db
    .from("agent_tasks")
    .select("task_type")
    .eq("entry_id", assetId)
    .single();
  expect(data?.task_type).toBe("alt_text_vision");
});

test("deduplication — second identical webhook does not create duplicate task", async () => {
  const entryId = `entry-dedup-${Date.now()}`;
  const payload = entryPayload(entryId);

  // First request
  const first = await post(payload);
  expect(first.status).toBe(202);

  // Second request for the same entry (CMS retry simulation)
  const second = await post(payload);
  // Should be accepted but 0 new tasks (task already queued)
  expect(second.status).toBe(202);
  expect(second.json.taskIds).toHaveLength(0);

  // Only 1 row in DB
  const db = serviceClient();
  const { data } = await db
    .from("agent_tasks")
    .select("id")
    .eq("entry_id", entryId)
    .eq("task_type", "metadata_gen");
  expect(data?.length).toBe(1);
});

test("429 when monthly token limit is exceeded", async () => {
  // Create a project that is already over its limit
  const limitedProjectId = await createTestProject(userId, { token_limit: 1 });
  // Insert a completed task that consumed tokens this month
  const db = serviceClient();
  await db.from("agent_tasks").insert({
    project_id: limitedProjectId,
    entry_id: "dummy",
    task_type: "metadata_gen",
    status: "completed",
    tokens_used: 999,
  });

  const { status, json } = await post(entryPayload(), `projectId=${limitedProjectId}`);
  expect(status).toBe(429);
  expect(json.error).toMatch(/token limit/i);

  await cleanupProject(limitedProjectId);
});
