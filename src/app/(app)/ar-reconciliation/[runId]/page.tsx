import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, exceptions, ledgerLines, matches, tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SEVERITY_ORDER } from "@/modules/ar-reconciliation/labels";
import { RUN_STAGES } from "@/modules/ar-reconciliation/run";
import ExceptionQueue from "./ExceptionQueue";
import RunProgress from "./RunProgress";
import AiInsightsButton from "./AiInsightsButton";
import styles from "../../app.module.css";

const aed = (v: string | number | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function RunResults({ params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "ar-reconciliation.view"))) redirect("/dashboard");
  const canExport = await can(user, "ar-reconciliation.report.export");
  const canApprove = await can(user, "ar-reconciliation.exception.approve");
  const canAdjust = await can(user, "ar-reconciliation.exception.adjust");

  const [run] = await db
    .select({
      id: reconciliationRuns.id,
      name: reconciliationRuns.name,
      status: reconciliationRuns.status,
      stage: reconciliationRuns.stage,
      tenantId: reconciliationRuns.tenantId,
      autoMatchPct: reconciliationRuns.autoMatchPct,
      matchedValue: reconciliationRuns.matchedValue,
      error: reconciliationRuns.error,
      createdAt: reconciliationRuns.createdAt,
      company: tenants.name,
    })
    .from(reconciliationRuns)
    .leftJoin(tenants, eq(reconciliationRuns.tenantId, tenants.id))
    .where(eq(reconciliationRuns.id, params.runId))
    .limit(1);

  if (!run) notFound();
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) notFound();

  // Still processing (async worker) — show the live stepper instead of results.
  if (run.status === "running" || run.status === "queued") {
    return (
      <>
        <div className={styles.pageHead}>
          <div>
            <div className={styles.eyebrow}>AR Reconciliation · Run</div>
            <h1>{run.name}</h1>
            <p>{run.company ?? ""}</p>
          </div>
        </div>
        <RunProgress runId={run.id} stages={[...RUN_STAGES]} initialStage={run.stage} initialStatus={run.status} />
      </>
    );
  }

  const [{ n: lineCount } = { n: 0 }] = await db
    .select({ n: count() }).from(ledgerLines).where(eq(ledgerLines.runId, run.id));
  const [{ n: matchCount } = { n: 0 }] = await db
    .select({ n: count() }).from(matches).where(eq(matches.runId, run.id));

  const exRows = await db
    .select({
      id: exceptions.id,
      categoryCode: exceptions.categoryCode,
      severity: exceptions.severity,
      amount: exceptions.amount,
      status: exceptions.status,
      note: exceptions.resolutionNote,
      aiExplanation: exceptions.aiExplanation,
      aiRecommendation: exceptions.aiRecommendation,
      aiModel: exceptions.aiModel,
      reference: ledgerLines.reference,
      description: ledgerLines.description,
      side: ledgerLines.side,
    })
    .from(exceptions)
    .leftJoin(ledgerLines, eq(exceptions.ledgerLineId, ledgerLines.id))
    .where(eq(exceptions.runId, run.id));

  exRows.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  const openCount = exRows.filter((e) => e.status === "open").length;
  const queueRows = exRows.map((e) => ({
    id: e.id,
    reference: e.reference ?? "",
    description: e.description ?? "",
    side: e.side ?? "",
    category: e.categoryCode,
    severity: e.severity,
    amount: e.amount,
    status: e.status,
    note: e.note,
    aiExplanation: e.aiExplanation,
    aiRecommendation: e.aiRecommendation,
    aiModel: e.aiModel,
  }));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>
            <Link href="/ar-reconciliation" style={{ color: "var(--accent-ink)" }}>AR Reconciliation</Link> / Run
          </div>
          <h1>{run.name}</h1>
          <p>
            {run.company ? `${run.company} · ` : ""}
            {run.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {(canApprove || canAdjust) && exRows.length > 0 && <AiInsightsButton runId={run.id} />}
          {canExport && run.status === "completed" && (
            <a href={`/ar-reconciliation/${run.id}/export`} className={`${styles.btn} ${styles.btnPrimary}`}>
              ⭳ Export Excel
            </a>
          )}
        </div>
      </div>

      {run.status === "failed" ? (
        <div className={`${styles.alert} ${styles.alertErr}`}>Reconciliation failed: {run.error}</div>
      ) : (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--brand)" }} />
              <div className={styles.kLab}>Auto-match rate</div>
              <div className={styles.kVal}>{run.autoMatchPct != null ? `${Number(run.autoMatchPct).toFixed(1)}%` : "—"}</div>
              <div className={styles.kFoot}>{lineCount} lines · {matchCount} matches</div>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--g-ink)" }} />
              <div className={styles.kLab}>Matched value</div>
              <div className={styles.kVal} style={{ fontSize: 21 }}>{aed(run.matchedValue)}</div>
              <div className={styles.kFoot}>Reconciled by rule</div>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--c-ink)" }} />
              <div className={styles.kLab}>Open exceptions</div>
              <div className={styles.kVal}>{openCount}</div>
              <div className={styles.kFoot}>of {exRows.length} total</div>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--brand-2)" }} />
              <div className={styles.kLab}>Status</div>
              <div className={styles.kVal} style={{ fontSize: 19, textTransform: "capitalize" }}>{run.status}</div>
              <div className={styles.kFoot}>AI commentary in Phase 3</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              Exception queue ({exRows.length})
              {(canApprove || canAdjust) && <span className={styles.help}>Click a row to review & resolve</span>}
            </div>
            <ExceptionQueue rows={queueRows} canApprove={canApprove} canAdjust={canAdjust} />
          </div>
        </>
      )}
    </>
  );
}
