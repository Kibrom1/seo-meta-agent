/**
 * E2E — GET /api/projects/[id] and PATCH /api/projects/[id]
 * Also covers POST /api/projects/[id]/test-webhook
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  serviceClient,
  ensureTestUser,
  ensureOtherTestUser,
  createTestProject,
  cleanupProject,
  getAuthCookie,
} from "../helpers/db";

let userId: string;
let otherUserId: string;
let projectId: string;
let authCookie = "";

test.beforeAll(async () => {
  [userId, otherUserId] = await Promise.all([ensureTestUser(), ensureOtherTestUser()]);
  projectId = await createTestProject(userId, { primary_locale: "en-US" });
  authCookie = await getAuthCookie();
});

test.afterAll(async () => {
  await cleanupProject(projectId).catch(() => {});
});

function authHeaders() {
  return { Cookie: authCookie, "Content-Type": "application/json" };
}

// ── GET /api/projects/[id] ────────────────────────────────────────────────────

test("GET project — 200 returns project without sensitive fields", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    headers: authHeaders(),
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.id).toBe(projectId);
  expect(json.brand_name).toBeTruthy();
  // Sensitive fields must not leak
  expect(json.api_key_enc).toBeUndefined();
  expect(json.webhook_secret).toBeUndefined();
});

test("GET project — 403 for non-owner", async () => {
  // Create a project owned by the other test user
  const otherProjectId = await createTestProject(otherUserId);
  const res = await fetch(`${BASE_URL}/api/projects/${otherProjectId}`, {
    headers: authHeaders(),
  });
  expect([403, 404]).toContain(res.status);
  await cleanupProject(otherProjectId).catch(() => {});
});

test("GET project — 404 for unknown id", async () => {
  const res = await fetch(
    `${BASE_URL}/api/projects/00000000-0000-0000-0000-000000000000`,
    { headers: authHeaders() }
  );
  expect(res.status).toBe(404);
});

// ── PATCH /api/projects/[id] ──────────────────────────────────────────────────

test("PATCH — 200 updates tone_guidelines", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ tone_guidelines: "Friendly and concise" }),
  });
  expect(res.status).toBe(200);

  const { data } = await serviceClient()
    .from("projects")
    .select("tone_guidelines")
    .eq("id", projectId)
    .single();
  expect(data?.tone_guidelines).toBe("Friendly and concise");
});

test("PATCH — 200 updates primary_locale", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ primary_locale: "fr-FR" }),
  });
  expect(res.status).toBe(200);

  const { data } = await serviceClient()
    .from("projects")
    .select("primary_locale")
    .eq("id", projectId)
    .single();
  expect(data?.primary_locale).toBe("fr-FR");
});

test("PATCH — 400 when linking_threshold is out of range", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ linking_threshold: 1.5 }),
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/threshold/i);
});

test("PATCH — 400 when primary_locale is invalid", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ primary_locale: "not-a-valid-locale!!" }),
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/locale/i);
});

test("PATCH — 400 when tone_guidelines exceeds 2000 chars", async () => {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ tone_guidelines: "x".repeat(2001) }),
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/tone/i);
});

test("PATCH — credential rotation re-encrypts api_key", async () => {
  const { data: before } = await serviceClient()
    .from("projects")
    .select("api_key_enc")
    .eq("id", projectId)
    .single();

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ api_key: "new-rotated-api-key-value" }),
  });
  expect(res.status).toBe(200);

  const { data: after } = await serviceClient()
    .from("projects")
    .select("api_key_enc")
    .eq("id", projectId)
    .single();

  expect(after?.api_key_enc).not.toBe(before?.api_key_enc);
  const parts = (after?.api_key_enc ?? "").split(":");
  expect(parts).toHaveLength(3);
  expect(parts[0]).toHaveLength(24);
  expect(parts[1]).toHaveLength(32);
});

test("PATCH — token_limit cannot be updated via settings API", async () => {
  const { data: before } = await serviceClient()
    .from("projects")
    .select("token_limit")
    .eq("id", projectId)
    .single();

  await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ token_limit: 9_999_999 }),
  });

  const { data: after } = await serviceClient()
    .from("projects")
    .select("token_limit")
    .eq("id", projectId)
    .single();
  expect(after?.token_limit).toBe(before?.token_limit);
});

// ── POST /api/projects/[id]/test-webhook ──────────────────────────────────────

test("test-webhook — returns ok boolean and message", async () => {
  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/test-webhook`,
    { method: "POST", headers: authHeaders() }
  );
  // May return ok: false if the webhook secret placeholder can't be decrypted in local env;
  // that case is handled gracefully (200 with ok: false) not a 500.
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(typeof json.ok).toBe("boolean");
  expect(typeof json.message).toBe("string");
});
