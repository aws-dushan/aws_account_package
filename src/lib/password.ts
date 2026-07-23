import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "node:crypto";

// argon2id via WASM — portable across Windows dev and Linux (Docker) with no
// native binary. Parameters follow the OWASP baseline.
export async function hashPassword(plain: string): Promise<string> {
  return argon2id({
    password: plain,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: plain, hash: stored });
  } catch {
    return false;
  }
}
