import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from "crypto";

// ============================================================
// HMAC Validation
// ============================================================

/**
 * Validates the X-Hub-Signature-256 header sent by the CMS webhook.
 * Must receive the raw body Buffer BEFORE any JSON parsing.
 */
export function validateHmacSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = signatureHeader;
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
  } catch {
    return false;
  }
}

// ============================================================
// API Key Encryption (AES-256-GCM)
// Encryption key is stored in ENCRYPTION_SECRET env var (32-byte hex).
// ============================================================

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_SECRET;
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_SECRET must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string (e.g. a CMS API key).
 * Returns a base64-encoded string: iv:authTag:ciphertext
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a value produced by encryptApiKey.
 */
export function decryptApiKey(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
