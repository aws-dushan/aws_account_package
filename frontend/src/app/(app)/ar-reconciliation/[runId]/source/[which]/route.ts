import { apiFetch } from "@/lib/api";

/** Proxy an original uploaded document (statement | customer) from the API. */
export async function GET(_req: Request, { params }: { params: { runId: string; which: string } }) {
  const which = params.which === "customer" ? "customer" : "statement";
  const res = await apiFetch(`/api/runs/${params.runId}/source/${which}`);
  if (res.status === 401) return new Response("Unauthorized", { status: 401 });
  if (res.status === 403) return new Response("Forbidden", { status: 403 });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const body = await res.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="${which}"`,
      "Cache-Control": "no-store",
    },
  });
}
