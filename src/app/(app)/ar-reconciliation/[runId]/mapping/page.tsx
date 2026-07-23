import { redirect, notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, files } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { readUpload } from "@/lib/storage";
import { parseWorkbook } from "@/lib/xlsx";
import { autoDetectMapping } from "@/modules/ar-reconciliation/ledger-mapping";
import MappingForm, { type LedgerPreview } from "./MappingForm";
import styles from "../../../app.module.css";

async function preview(storageKey: string, name: string): Promise<LedgerPreview> {
  const rows = parseWorkbook(await readUpload(storageKey));
  const mapping = autoDetectMapping(rows);
  const headers = rows[mapping.headerRow] ?? [];
  const sample = rows.slice(mapping.headerRow + 1, mapping.headerRow + 6);
  return { name, headers, sample, mapping };
}

export default async function MappingPage({ params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "ar-reconciliation.run.create"))) redirect("/ar-reconciliation");

  const [run] = await db
    .select({ id: reconciliationRuns.id, name: reconciliationRuns.name, status: reconciliationRuns.status, tenantId: reconciliationRuns.tenantId, statementFileId: reconciliationRuns.statementFileId, customerFileId: reconciliationRuns.customerFileId })
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.id, params.runId))
    .limit(1);

  if (!run) notFound();
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) notFound();
  if (run.status !== "draft") redirect(`/ar-reconciliation/${run.id}`);
  if (!run.statementFileId || !run.customerFileId) notFound();

  const fileRows = await db
    .select({ id: files.id, storageKey: files.storageKey, originalName: files.originalName })
    .from(files)
    .where(inArray(files.id, [run.statementFileId, run.customerFileId]));
  const sf = fileRows.find((f) => f.id === run.statementFileId)!;
  const cf = fileRows.find((f) => f.id === run.customerFileId)!;

  const statement = await preview(sf.storageKey!, sf.originalName);
  const customer = await preview(cf.storageKey!, cf.originalName);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>AR Reconciliation · Step 2 of 2</div>
          <h1>Confirm column mapping</h1>
          <p>We auto-detected the columns. Adjust anything that looks wrong, then run the reconciliation.</p>
        </div>
      </div>
      <MappingForm runId={run.id} statement={statement} customer={customer} />
    </>
  );
}
