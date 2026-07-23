import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";

// Files live on a local volume (single-VPS). SHA-256 is stored permanently; the file
// itself is retained per policy. UPLOADS_DIR overrides the default ./uploads.
const UPLOADS = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

export type SavedUpload = { sha256: string; storageKey: string; size: number };

export async function saveUpload(tenantId: string, filename: string, buf: Buffer): Promise<SavedUpload> {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const dir = path.join(UPLOADS, tenantId);
  await mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const storageKey = path.posix.join(tenantId, `${sha256.slice(0, 12)}-${safe}`);
  await writeFile(path.join(UPLOADS, storageKey), buf);
  return { sha256, storageKey, size: buf.length };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  return readFile(path.join(UPLOADS, storageKey));
}

export async function deleteUpload(storageKey: string): Promise<void> {
  try {
    await unlink(path.join(UPLOADS, storageKey));
  } catch {
    /* already gone */
  }
}
