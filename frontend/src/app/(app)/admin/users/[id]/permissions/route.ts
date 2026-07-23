import { apiGetOrNull } from "@/lib/api";

/** Lazy-load a user's detail (permissions + account) for the manage popup. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const data = await apiGetOrNull<unknown>(`/api/users/${params.id}`);
  if (!data) return new Response("Not found", { status: 404 });
  return Response.json(data);
}
