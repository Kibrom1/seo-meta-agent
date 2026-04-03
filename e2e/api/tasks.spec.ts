/**
 * E2E — GET /api/projects/[id]/tasks and POST /api/projects/[id]/tasks/retry
 *
 * Covers:
 *  - Task listing with `since` polling param and `status` filter
 *  - error_message field returned for failed tasks
 *  - Retry endpoint resets status to "queued" and re-enqueues
 *  - Retry returns 400 when no failed tasks exist
 *  - Targeted retry via task_ids
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  serviceClient,
  ensureTestUser,
  ensureOtherTestUser,
  createTestProject,
  createTestTask,
  cleanupProject,
  getAuthCookie,
} from "../helpers/db";

let userId: string;
let projectId: string;
let authCookie = "";

test.beforeAll(async () => {
  userId = await ensureTestUser();
  projectId = await createTestProject(userId);
  authCookie = await getAuthCookie();
});

test.afterAll(async () => {
  await cleanupProject(projectId).catch(() => {});
});

function authHeaders() {
  return { Cookie: authCookie, "Content-Type": "application/json" };
}

// ── GET /api/projects/[id]/tasks ─────────────────────────────────────────────

test("GET tasks — 200 returns task list", async () => {
  await createTestTask(projectId, "entry-list-test", { status: "completed", tokens_used: 100 });
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
    headers: authHeaders(),
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.tasks)).toBe(true);
  expect(json.tasks.length).toBeGreaterThan(0);
  expect(typeof json.total_failed).toBe("number");
});

test("GET tasks — error_message is returned for failed tasks", async () => {
  await createTestTask(projectId, "entry-failed-msg", {
    status: "failed",
    error_message: "Claude API returned 529 Overloaded",
    tokens_used: 0,
  });

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
    headers: authHeaders(),
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  const failed = json.tasks.find(
    (t: { entry_id: string }) => t.entry_id === "entry-failed-msg"
  );
  expect(failed).toBeDefined();
  expect(failed.error_message).toBe("Claude API returned 529 Overloaded");
});

test("GET tasks — ?since filters to tasks updated after timestamp", async () => {
  const since = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 50));
  await createTestTask(projectId, "entry-since-filter", { status: "completed", tokens_used: 42 });

  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/tasks?since=${encodeURIComponent(since)}`,
    { headers: authHeaders() }
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  const match = json.tasks.find(
    (t: { entry_id: string }) => t.entry_id === "entry-since-filter"
  );
  expect(match).toBeDefined();
});

test("GET tasks — ?status=failed returns only failed tasks", async () => {
  const res = await fetch(
    `${BASE_URL}/api/projects/${projectId}/tasks?status=failed`,
    { headers: authHeaders() }
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  for (const task of json.tasks) {
    expect(task.status).toBe("failed");
  }
});

// ── POST /api/projects/[id]/tasks/retry ───────────────────────────────────────

test("retry — 202 resets failed tasks to queued", async () => {
  const entryId = `entry-retry-${Date.now()}`;
  const payload = { sys: { id: entryId, type: "Entry" }, fields: { title: { "en-US": "Retry Test" } } };

  await createTestTask(projectId, entryId, {
    status: "failed",
    error_message: "timeout",
    tokens_used: 0,
    payload,
  });

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
  expect(res.status).toBe(202);
  const json = await res.json();
  expect(json.retried).toBeGreaterThan(0);
  expect(Array.isArray(json.task_ids)).toBe(true);

  const { data: tasks } = await serviceClient()
    .from("agent_tasks")
    .select("status, error_message")
    .eq("entry_id", entryId)
    .eq("project_id", projectId);

  for (const t of tasks ?? []) {
    expect(t.status).toBe("queued");
    expect(t.error_message).toBeNull();
  }
});

test("retry — 400 when no failed tasks exist", async () => {
  const cleanProjectId = await createTestProject(userId);
  await createTestTask(cleanProjectId, "entry-ok", { status: "completed", tokens_used: 100 });

  const res = await fetch(`${BASE_URL}/api/projects/${cleanProjectId}/tasks/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/no failed/i);

  await cleanupProject(cleanProjectId).catch(() => {});
});

test("retry — specific task_ids only retries those tasks", async () => {
  const entryA = `entry-specific-a-${Date.now()}`;
  const entryB = `entry-specific-b-${Date.now()}`;
  const payloadA = { sys: { id: entryA, type: "Entry" }, fields: { title: { "en-US": "A" } } };
  const payloadB = { sys: { id: entryB, type: "Entry" }, fields: { title: { "en-US": "B" } } };

  const taskAId = await createTestTask(projectId, entryA, {
    status: "failed",
    error_message: "err",
    tokens_used: 0,
    payload: payloadA,
  });
  await createTestTask(projectId, entryB, {
    status: "failed",
    error_message: "err",
    tokens_used: 0,
    payload: payloadB,
  });

  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks/retry`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ task_ids: [taskAId] }),
  });
  expect(res.status).toBe(202);
  const json = await res.json();
  expect(json.task_ids).toContain(taskAId);

  const { data: taskA } = await serviceClient()
    .from("agent_tasks")
    .select("status")
    .eq("id", taskAId)
    .single();
  expect(taskA?.status).toBe("queued");

  const { data: tasksBForEntry } = await serviceClient()
    .from("agent_tasks")
    .select("status")
    .eq("entry_id", entryB)
    .eq("project_id", projectId);
  for (const t of tasksBForEntry ?? []) {
    expect(t.status).toBe("failed");
  }
});

test("retry — 403 when called by non-owner", async () => {
  const otherUserId = await ensureOtherTestUser();
  const otherProjectId = await createTestProject(otherUserId);
  await createTestTask(otherProjectId, "entry-403-test", {
    status: "failed",
    error_message: "err",
    tokens_used: 0,
    payload: { sys: { id: "entry-403-test", type: "Entry" }, fields: {} },
  });

  // Primary test user tries to retry tasks in a project they don't own
  const res = await fetch(`${BASE_URL}/api/projects/${otherProjectId}/tasks/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
  expect([403, 404]).toContain(res.status);

  await cleanupProject(otherProjectId).catch(() => {});
});
