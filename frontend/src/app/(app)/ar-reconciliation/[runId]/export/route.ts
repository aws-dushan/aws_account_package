import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { assembleExportData } from "@/modules/ar-reconciliation/export-data";
import { buildRunWorkbook } from "@/modules/ar-reconciliation/export";

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await can(user, "ar-reconciliation.report.export"))) return new Response("Forbidden", { status: 403 });

  const result = await assembleExportData(params.runId);
  if (!result) return new Response("Not found", { status: 404 });
  if (!user.isSuperAdmin && result.tenantId !== user.tenantId) return new Response("Not found", { status: 404 });

  const buffer = await buildRunWorkbook(result.data);
  await writeAudit({ action: "reconciliation.export", entity: "reconciliation_run", entityId: params.runId, tenantId: result.tenantId, metadata: { format: "xlsx" } });

  const safeName = result.data.run.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "reconciliation";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
