import { apiFetch } from "@/lib/api";

/** Proxy the Excel export from the API, forwarding the caller's auth cookie as a bearer token. */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const res = await apiFetch(`/api/runs/${params.runId}/export/excel`);
  if (res.status === 401) return new Response("Unauthorized", { status: 401 });
  if (res.status === 403) return new Response("Forbidden", { status: 403 });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const body = await res.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="reconciliation.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
