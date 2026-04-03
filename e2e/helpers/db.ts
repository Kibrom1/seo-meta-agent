/**
 * E2E test helpers — direct Supabase service-client access for setup/teardown.
 * Uses the local Docker Supabase stack (same creds as .env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const BASE_URL = "http://localhost:3000";

// Service-role client bypasses RLS — only for test setup/teardown
export function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export const TEST_USER = {
  email: "e2e-test@seo-agent.local",
  password: "E2eTestPass123!",
};

export const TEST_USER_OTHER = {
  email: "e2e-test-other@seo-agent.local",
  password: "E2eTestPass123!",
};

/** Ensure a test user exists by email; returns the user id */
async function ensureUserByEmail(email: string, password: string): Promise<string> {
  const admin = serviceClient();
  const { data: { users } } = await admin.auth.admin.listUsers();
  const existing = users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not create test user ${email}: ${error.message}`);
  return data.user.id;
}

/** Ensure the primary test user exists; returns the user id */
export async function ensureTestUser(): Promise<string> {
  return ensureUserByEmail(TEST_USER.email, TEST_USER.password);
}

/** Ensure a secondary test user exists (for ownership/403 tests); returns the user id */
export async function ensureOtherTestUser(): Promise<string> {
  return ensureUserByEmail(TEST_USER_OTHER.email, TEST_USER_OTHER.password);
}

/**
 * Obtain a valid auth cookie for the given credentials.
 * @supabase/ssr stores sessions as a base64url-encoded JSON string.
 */
export async function getAuthCookie(
  email = TEST_USER.email,
  password = TEST_USER.password
): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    }
  );
  if (!res.ok) throw new Error(`Auth failed for ${email}: ${res.status}`);
  const session = await res.json();
  // @supabase/ssr encodes the full session object as base64url
  const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-127-auth-token=${encoded}`;
}

/** Create a project row directly (bypasses API auth bypass) */
export async function createTestProject(userId: string, overrides: Record<string, unknown> = {}) {
  const db = serviceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: userId,
      brand_name: "E2E Test Brand",
      cms_type: "Contentful",
      api_key_enc: "iv:tag:ciphertext", // placeholder — not used in API-only tests
      webhook_secret: "iv:tag:wsecret",
      tone_guidelines: "Professional",
      token_limit: 100_000,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test project: ${error.message}`);
  return data.id as string;
}

/** Create an agent_task row directly.
 *  Accepts optional `error_message` and `payload` fields added in migration 003.
 */
export async function createTestTask(
  projectId: string,
  entryId: string,
  overrides: Record<string, unknown> = {}
) {
  const db = serviceClient();
  const { data, error } = await db
    .from("agent_tasks")
    .insert({
      project_id: projectId,
      entry_id: entryId,
      task_type: "metadata_gen",
      status: "completed",
      tokens_used: 250,
      error_message: null,
      payload: null,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create test task: ${error.message}`);
  return data.id as string;
}

/** Delete all test data for a project */
export async function cleanupProject(projectId: string) {
  const db = serviceClient();
  await db.from("projects").delete().eq("id", projectId);
}

/** Build a valid HMAC signature for a webhook payload */
export function signPayload(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}
