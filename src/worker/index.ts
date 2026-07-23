import "dotenv/config";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { getConnection, RECON_QUEUE } from "../lib/queue";
import { db } from "../db";
import { reconciliationRuns } from "../db/schema";
import { processRun } from "../modules/ar-reconciliation/run";

const connection = getConnection();
if (!connection) {
  console.error("REDIS_URL is not set — the reconciliation worker cannot start.");
  process.exit(1);
}

const worker = new Worker(
  RECON_QUEUE,
  async (job) => {
    const { runId } = job.data as { runId: string };
    await db.update(reconciliationRuns).set({ status: "running", error: null }).where(eq(reconciliationRuns.id, runId));
    try {
      await processRun(runId); // executeRun marks the run completed
    } catch (e) {
      const message = e instanceof Error ? e.message : "Reconciliation failed.";
      await db.update(reconciliationRuns).set({ status: "failed", error: message }).where(eq(reconciliationRuns.id, runId));
      throw e;
    }
  },
  { connection, concurrency: 2 },
);

worker.on("completed", (job) => console.log(`✓ reconciliation ${job?.data?.runId} completed`));
worker.on("failed", (job, err) => console.error(`✗ reconciliation ${job?.data?.runId} failed:`, err?.message));

console.log("Reconciliation worker started, waiting for jobs…");
