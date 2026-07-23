import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

// Server-Sent Events: polls the API for the run's status + stage until it finishes.
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const first = await apiFetch(`/api/runs/${params.runId}`);
  if (first.status === 401) return new Response("Unauthorized", { status: 401 });
  if (first.status === 403) return new Response("Forbidden", { status: 403 });
  if (!first.ok) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`));
      const initial = (await first.json()) as { status?: string; stage?: string | null };
      send({ status: initial.status, stage: initial.stage });
      if (initial.status === "completed" || initial.status === "failed") {
        controller.close();
        return;
      }
      for (let i = 0; i < 600; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        const res = await apiFetch(`/api/runs/${params.runId}`);
        if (!res.ok) break;
        const r = (await res.json()) as { status?: string; stage?: string | null };
        send({ status: r.status, stage: r.stage });
        if (r.status === "completed" || r.status === "failed") break;
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
