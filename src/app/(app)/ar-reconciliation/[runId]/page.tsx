import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/db";
import { reconciliationRuns, exceptions, ledgerLines, matches, tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { CATEGORY_LABEL, SEVERITY_ORDER } from "@/modules/ar-reconciliation/labels";
import styles from "../../app.module.css";

const SEV_CLASS: Record<string, string> = {
  g: styles.sevG, a: styles.sevA, c: styles.sevC, r: styles.sevR, n: styles.sevN,
};
const aed = (v: string | number | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function RunResults({ params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "ar-reconciliation.view"))) redirect("/dashboard");

  const [run] = await db
    .select({
      id: reconciliationRuns.id,
      name: reconciliationRuns.name,
      status: reconciliationRuns.status,
      tenantId: reconciliationRuns.tenantId,
      autoMatchPct: reconciliationRuns.autoMatchPct,
      matchedValue: reconciliationRuns.matchedValue,
      error: reconciliationRuns.error,
      periodStart: reconciliationRuns.periodStart,
      periodEnd: reconciliationRuns.periodEnd,
      company: tenants.name,
    })
    .from(reconciliationRuns)
    .leftJoin(tenants, eq(reconciliationRuns.tenantId, tenants.id))
    .where(eq(reconciliationRuns.id, params.runId))
    .limit(1);

  if (!run) notFound();
  if (!user.isSuperAdmin && run.tenantId !== user.tenantId) notFound();

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
      reference: ledgerLines.reference,
      description: ledgerLines.description,
      side: ledgerLines.side,
    })
    .from(exceptions)
    .leftJoin(ledgerLines, eq(exceptions.ledgerLineId, ledgerLines.id))
    .where(eq(exceptions.runId, run.id));

  exRows.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

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
            {run.periodStart && run.periodEnd ? `${run.periodStart} → ${run.periodEnd}` : "Period not set"}
          </p>
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
              <div className={styles.kVal}>{exRows.length}</div>
              <div className={styles.kFoot}>Need review</div>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--brand-2)" }} />
              <div className={styles.kLab}>Status</div>
              <div className={styles.kVal} style={{ fontSize: 19, textTransform: "capitalize" }}>{run.status}</div>
              <div className={styles.kFoot}>AI commentary in Phase 3</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>Exception queue ({exRows.length})</div>
            <div className={styles.tableWrap}>
              {exRows.length === 0 ? (
                <div className={styles.empty}>No exceptions — everything reconciled. 🎉</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Description</th>
                      <th>Side</th>
                      <th className="num" style={{ textAlign: "right" }}>Amount</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exRows.map((e) => (
                      <tr key={e.id}>
                        <td className={styles.mono} style={{ fontWeight: 600 }}>{e.reference || "—"}</td>
                        <td style={{ color: "var(--ink-2)" }}>{e.description || "—"}</td>
                        <td style={{ color: "var(--muted)", fontSize: 12.5 }}>
                          {e.side === "statement" ? "Statement" : e.side === "customer" ? "Customer" : "—"}
                        </td>
                        <td className={styles.mono} style={{ textAlign: "right" }}>{aed(e.amount)}</td>
                        <td>
                          <span className={`${styles.badge} ${SEV_CLASS[e.severity] ?? styles.badgeOff}`}>
                            {CATEGORY_LABEL[e.categoryCode] ?? e.categoryCode}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
