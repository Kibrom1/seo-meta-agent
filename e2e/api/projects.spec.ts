/**
 * E2E — POST /api/projects
 *
 * Tests project creation: validation, AES-256-GCM encryption of api_key and
 * webhook_secret at rest, Stripe customer creation, and Supabase insert.
 *
 * Auth is currently bypassed in the route (hardcoded userId) so we don't need
 * a real session for these tests.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL, serviceClient, cleanupProject } from "../helpers/db";

const ENDPOINT = `${BASE_URL}/api/projects`;
const CREATED_IDS: string[] = [];

async function post(body: object) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (res.ok && json.id) CREATED_IDS.push(json.id);
  return { status: res.status, json };
}

test.afterAll(async () => {
  for (const id of CREATED_IDS) {
    await cleanupProject(id).catch(() => {});
  }
});

// ── Validation ───────────────────────────────────────────────────────────────

test("400 when brand_name is missing", async () => {
  const { status, json } = await post({
    cms_type: "Contentful",
    api_key: "key",
    webhook_secret: "secret",
  });
  expect(status).toBe(400);
  expect(json.error).toMatch(/missing/i);
});

test("400 when api_key is missing", async () => {
  const { status, json } = await post({
    brand_name: "Test",
    cms_type: "Contentful",
    webhook_secret: "secret",
  });
  expect(status).toBe(400);
  expect(json.error).toMatch(/missing/i);
});

test("400 when webhook_secret is missing", async () => {
  const { status, json } = await post({
    brand_name: "Test",
    cms_type: "Contentful",
    api_key: "key",
  });
  expect(status).toBe(400);
  expect(json.error).toMatch(/missing/i);
});

// ── Happy path ───────────────────────────────────────────────────────────────

test("201 — project created and returns id", async () => {
  const { status, json } = await post({
    brand_name: "E2E Test Corp",
    cms_type: "Contentful",
    api_key: "sk-contentful-test-key",
    webhook_secret: "my-webhook-secret-value",
    tone_guidelines: "Friendly and concise",
  });
  expect(status).toBe(201);
  expect(json.id).toBeTruthy();
  expect(typeof json.id).toBe("string");
});

test("api_key and webhook_secret are stored encrypted (not plaintext) in DB", async () => {
  const plainApiKey = "sk-plaintext-api-key-12345";
  const plainSecret = "plaintext-webhook-secret";

  const { status, json } = await post({
    brand_name: "Encryption Test Brand",
    cms_type: "Sanity",
    api_key: plainApiKey,
    webhook_secret: plainSecret,
  });
  expect(status).toBe(201);

  const db = serviceClient();
  const { data } = await db
    .from("projects")
    .select("api_key_enc, webhook_secret")
    .eq("id", json.id)
    .single();

  // Stored values must NOT be plaintext
  expect(data?.api_key_enc).not.toBe(plainApiKey);
  expect(data?.webhook_secret).not.toBe(plainSecret);

  // Must be in iv:authTag:ciphertext format (three colon-separated hex strings)
  const parts = (data?.api_key_enc ?? "").split(":");
  expect(parts).toHaveLength(3);
  expect(parts[0]).toHaveLength(24); // 12-byte IV → 24 hex chars
  expect(parts[1]).toHaveLength(32); // 16-byte auth tag → 32 hex chars
});

test("tone_guidelines is stored as null when omitted", async () => {
  const { status, json } = await post({
    brand_name: "No Guidelines Brand",
    cms_type: "Strapi",
    api_key: "key",
    webhook_secret: "secret",
    // tone_guidelines intentionally omitted
  });
  expect(status).toBe(201);

  const db = serviceClient();
  const { data } = await db
    .from("projects")
    .select("tone_guidelines")
    .eq("id", json.id)
    .single();

  expect(data?.tone_guidelines).toBeNull();
});

test("Stripe warning surfaced in response when Stripe key is invalid", async () => {
  // The local test env uses a test Stripe key; it may succeed or fail.
  // Either way, the response shape must be valid (no 500).
  const { status, json } = await post({
    brand_name: "Stripe Warning Test",
    cms_type: "Contentful",
    api_key: "key",
    webhook_secret: "secret",
  });
  // Must be 201 regardless of Stripe status
  expect(status).toBe(201);
  expect(json.id).toBeTruthy();
  // If Stripe failed, a warning field should be present
  if (!json.warning) {
    // Stripe succeeded — stripe_customer_id should be set in DB
    const db = serviceClient();
    const { data } = await db
      .from("projects")
      .select("stripe_customer_id")
      .eq("id", json.id)
      .single();
    expect(data?.stripe_customer_id).toBeTruthy();
  } else {
    expect(json.warning).toMatch(/stripe/i);
  }
});

test("default token_limit is 10,000 for new projects", async () => {
  const { status, json } = await post({
    brand_name: "Token Limit Test",
    cms_type: "Contentful",
    api_key: "key",
    webhook_secret: "secret",
  });
  expect(status).toBe(201);

  const db = serviceClient();
  const { data } = await db
    .from("projects")
    .select("token_limit")
    .eq("id", json.id)
    .single();
  expect(data?.token_limit).toBe(10_000);
});
