import { Queue } from "bullmq";
import IORedis from "ioredis";

// Background processing is optional: with REDIS_URL set (+ the worker running),
// reconciliations run async with live progress; otherwise they run synchronously.
const REDIS_URL = process.env.REDIS_URL;
export const RECON_QUEUE = "reconciliation";

let connection: IORedis | null = null;
let queue: Queue | null = null;

export function isQueueEnabled(): boolean {
  return !!REDIS_URL;
}

export function getConnection(): IORedis | null {
  if (!REDIS_URL) return null;
  if (!connection) connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

export function getQueue(): Queue | null {
  const conn = getConnection();
  if (!conn) return null;
  if (!queue) queue = new Queue(RECON_QUEUE, { connection: conn });
  return queue;
}

export async function enqueueReconcile(runId: string): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add("reconcile", { runId }, { removeOnComplete: 200, removeOnFail: 200, attempts: 1 });
  return true;
}
