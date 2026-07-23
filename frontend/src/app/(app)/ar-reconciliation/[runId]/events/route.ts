import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Server-Sent Events: streams the run's status + stage until it finishes.
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await can(user, "ar-reconciliation.view"))) return new Response("Forbidden", { status: 403 });

  const [run] = await db
    .select({ tenantId: reconciliationRuns.tenantId })
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.id, params.runId))
    .limit(1);
  if (!run) return new Response("Not found", { status: 404 });
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      for (let i = 0; i < 600; i++) {
        const [r] = await db
          .select({ status: reconciliationRuns.status, stage: reconciliationRuns.stage })
          .from(reconciliationRuns)
          .where(eq(reconciliationRuns.id, params.runId))
          .limit(1);
        if (!r) break;
        send({ status: r.status, stage: r.stage });
        if (r.status === "completed" || r.status === "failed") break;
        await new Promise((res) => setTimeout(res, 1000));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
