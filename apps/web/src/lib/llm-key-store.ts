import { webcrypto } from "node:crypto";
import type { EncryptedPayload, LlmConfig } from "@quorum/shared";

/**
 * Encrypted LLM-key store — the sacred BYOK layer.
 *
 * The user's LLM API key is the ONLY secret a user provides. It is encrypted
 * with AES-256-GCM using a per-deployment `ENCRYPTION_KEY` (a Vercel env var
 * the operator sets once). At rest it lives in Redis; the plain value is only
 * ever materialized inside an Inngest step and forwarded to Modal, then never
 * persisted.
 */

const subtle = webcrypto.subtle;

function encryptionKey(): ArrayBuffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is not set. The operator must provide it to store LLM keys.",
    );
  }
  // Derive a 256-bit key from the env var via SHA-256 so any-length passphrases work.
  // (webcrypto doesn't accept raw strings as AES keys directly.)
  return Buffer.from(raw, "utf-8").subarray(0, 32).buffer as ArrayBuffer;
}

async function importAesKey(): Promise<CryptoKey> {
  const keyBytes = encryptionKey();
  // If the env var is shorter than 32 bytes, hash it to derive a full-length key.
  let material: ArrayBuffer;
  if (keyBytes.byteLength >= 32) {
    material = keyBytes.slice(0, 32);
  } else {
    const digest = await subtle.digest("SHA-256", Buffer.from(process.env.ENCRYPTION_KEY!, "utf-8"));
    material = digest;
  }
  return subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a plaintext LLM key into a storable payload. */
export async function encryptLlmKey(plaintext: string): Promise<EncryptedPayload> {
  const key = await importAesKey();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ct: Buffer.from(new Uint8Array(ct)).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  };
}

/** Decrypt a stored payload back to the plaintext LLM key. */
export async function decryptLlmKey(payload: EncryptedPayload): Promise<string> {
  const key = await importAesKey();
  const iv = Buffer.from(payload.iv, "base64");
  const ct = Buffer.from(payload.ct, "base64");
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

/** Store a user's encrypted LLM key + non-secret provider config in Redis. */
export async function storeLlmConfig(
  userId: string,
  apiKey: string,
  llm: LlmConfig,
): Promise<void> {
  const { setEncryptedKey, setProviderMeta, llmKeyRefFor } = await import("./redis");
  const enc = await encryptLlmKey(apiKey);
  await setEncryptedKey(llmKeyRefFor(userId), enc);
  await setProviderMeta(userId, llm);
}

/** Fetch the encrypted payload for a given key ref (used by Inngest). */
export async function getEncryptedKey(
  keyRef: string,
): Promise<EncryptedPayload | null> {
  const { getEncryptedKey } = await import("./redis");
  return getEncryptedKey(keyRef);
}
