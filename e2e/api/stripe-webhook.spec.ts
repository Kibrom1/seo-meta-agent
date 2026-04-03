/**
 * E2E — POST /api/webhook/stripe
 *
 * Tests Stripe webhook signature validation and subscription event handling.
 * We build real Stripe webhook event shapes but sign them with a known test
 * secret rather than calling Stripe's live API.
 *
 * NOTE: Since we can't compute a valid Stripe signature without the real
 * STRIPE_WEBHOOK_SECRET, these tests validate the 400 rejection path
 * (invalid signature) and the full happy path with a mocked secret written
 * directly to process.env inside the test process.
 *
 * The Stripe signing path is: HMAC-SHA256 over `timestamp.payload`.
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  ensureTestUser,
  createTestProject,
  cleanupProject,
  serviceClient,
} from "../helpers/db";
import { createHmac } from "crypto";

const ENDPOINT = `${BASE_URL}/api/webhook/stripe`;

// A local test webhook secret — must match STRIPE_WEBHOOK_SECRET in the
// running Next.js process for the signature to verify.
// In CI/production use an env-injected value. Locally the .env.local has it blank,
// so we test the rejection path only.
const TEST_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function buildStripeEvent(type: string, data: object) {
  return {
    id: `evt_test_${Date.now()}`,
    object: "event",
    type,
    data: { object: data },
    livemode: false,
    created: Math.floor(Date.now() / 1000),
  };
}

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signed}`;
}

async function postStripe(event: object, secret = TEST_WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  const sig = secret ? stripeSignature(body, secret) : "invalid-signature";
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    },
    body,
  });
  const json = await res.json();
  return { status: res.status, json };
}

// ── Signature validation ──────────────────────────────────────────────────────

test("400 when stripe-signature header is missing or invalid", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "test" }),
  });
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toMatch(/signature/i);
});

// ── Plan upgrade/downgrade (only runs when webhook secret is configured) ──────

test.skip(
  !TEST_WEBHOOK_SECRET,
  "Skipped — STRIPE_WEBHOOK_SECRET not set in environment"
);

test("subscription.updated — token_limit updated to pro plan", async () => {
  if (!TEST_WEBHOOK_SECRET) return test.skip();

  const userId = await ensureTestUser();
  const projectId = await createTestProject(userId, {
    stripe_customer_id: "cus_e2e_test_001",
    token_limit: 10_000,
  });

  const event = buildStripeEvent("customer.subscription.updated", {
    customer: "cus_e2e_test_001",
    items: { data: [{ price: { id: "price_pro" } }] },
  });

  const { status, json } = await postStripe(event);
  expect(status).toBe(200);
  expect(json.received).toBe(true);

  const db = serviceClient();
  const { data } = await db.from("projects").select("token_limit").eq("id", projectId).single();
  expect(data?.token_limit).toBe(500_000);

  await cleanupProject(projectId);
});

test("subscription.deleted — token_limit reverts to free tier (10,000)", async () => {
  if (!TEST_WEBHOOK_SECRET) return test.skip();

  const userId = await ensureTestUser();
  const projectId = await createTestProject(userId, {
    stripe_customer_id: "cus_e2e_test_002",
    token_limit: 2_000_000, // was on scale plan
  });

  const event = buildStripeEvent("customer.subscription.deleted", {
    customer: "cus_e2e_test_002",
  });

  const { status, json } = await postStripe(event);
  expect(status).toBe(200);
  expect(json.received).toBe(true);

  const db = serviceClient();
  const { data } = await db.from("projects").select("token_limit").eq("id", projectId).single();
  expect(data?.token_limit).toBe(10_000);

  await cleanupProject(projectId);
});

test("unknown event type — returns 200 received:true (idempotent)", async () => {
  if (!TEST_WEBHOOK_SECRET) return test.skip();

  const event = buildStripeEvent("invoice.paid", { customer: "cus_unknown" });
  const { status, json } = await postStripe(event);
  expect(status).toBe(200);
  expect(json.received).toBe(true);
});
