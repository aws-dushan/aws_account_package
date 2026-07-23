import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM. The 32-byte key is derived from AI_KEY_ENCRYPTION_SECRET (host env),
// so any secret format works. Payload layout: base64( iv[12] · tag[16] · ciphertext ).
function key(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("AI_KEY_ENCRYPTION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Last-4 hint for display, e.g. "••••3f9a". Never returns the full key. */
export function keyHint(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const plain = decryptSecret(payload);
    return "••••" + plain.slice(-4);
  } catch {
    return "••••????";
  }
}
