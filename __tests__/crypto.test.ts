import { describe, it, expect, beforeAll } from "vitest";
import { validateHmacSignature, encryptApiKey, decryptApiKey } from "@/lib/crypto";
import { createHmac } from "crypto";

// AES-256-GCM key: 32 bytes = 64 hex chars
const TEST_SECRET = "a".repeat(64);

beforeAll(() => {
  process.env.ENCRYPTION_SECRET = TEST_SECRET;
});

describe("validateHmacSignature", () => {
  it("returns true for a valid signature", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const secret = "my-webhook-secret";
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(validateHmacSignature(body, sig, secret)).toBe(true);
  });

  it("returns false for a tampered body", () => {
    const originalBody = Buffer.from('{"a":1}');
    const tamperedBody = Buffer.from('{"a":2}');
    const secret = "my-webhook-secret";
    const sig = "sha256=" + createHmac("sha256", secret).update(originalBody).digest("hex");
    expect(validateHmacSignature(tamperedBody, sig, secret)).toBe(false);
  });

  it("returns false for a wrong secret", () => {
    const body = Buffer.from("payload");
    const sig = "sha256=" + createHmac("sha256", "correct-secret").update(body).digest("hex");
    expect(validateHmacSignature(body, sig, "wrong-secret")).toBe(false);
  });

  it("returns false for a malformed signature header", () => {
    const body = Buffer.from("payload");
    expect(validateHmacSignature(body, "not-a-sha256-sig", "secret")).toBe(false);
  });

  it("returns false for an empty signature header", () => {
    const body = Buffer.from("payload");
    expect(validateHmacSignature(body, "", "secret")).toBe(false);
  });
});

describe("encryptApiKey / decryptApiKey", () => {
  it("round-trips a plaintext API key", () => {
    const plaintext = "sk-contentful-api-key-12345";
    const encrypted = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const plaintext = "same-key";
    const enc1 = encryptApiKey(plaintext);
    const enc2 = encryptApiKey(plaintext);
    expect(enc1).not.toBe(enc2);
    // But both decrypt correctly
    expect(decryptApiKey(enc1)).toBe(plaintext);
    expect(decryptApiKey(enc2)).toBe(plaintext);
  });

  it("encrypted value has iv:authTag:ciphertext format", () => {
    const encrypted = encryptApiKey("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });

  it("throws if ENCRYPTION_SECRET is missing", () => {
    const saved = process.env.ENCRYPTION_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    expect(() => encryptApiKey("test")).toThrow("ENCRYPTION_SECRET");
    process.env.ENCRYPTION_SECRET = saved;
  });

  it("throws if ENCRYPTION_SECRET is wrong length", () => {
    process.env.ENCRYPTION_SECRET = "tooshort";
    expect(() => encryptApiKey("test")).toThrow("ENCRYPTION_SECRET");
    process.env.ENCRYPTION_SECRET = TEST_SECRET;
  });
});
