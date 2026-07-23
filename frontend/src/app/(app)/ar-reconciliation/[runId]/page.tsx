import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { apiGetOrNull, apiGet } from "@/lib/api";
import ResultsTable from "./ResultsTable";
import RunProgress from "./RunProgress";
import styles from "../../app.module.css";

const aed = (v: string | number | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type RunDetail = {
  id: string;
  name: string;
  status: string;
  stage: string | null;
  autoMatchPct: number | null;
  matchedValue: number | null;
  error: string | null;
  createdAt: string;
  company: string | null;
  counts: { lines: number; matches: number; exceptionsOpen: number; exceptionsTotal: number };
  stages: string[];
};

type ExRow = {
  id: string;
  categoryCode: string;
  severity: string;
  amount: number | null;
  status: string;
  aiExplanation: string | null;
  aiRecommendation: string | null;
  aiModel: string | null;
  resolutionNote: string | null;
  reference: string | null;
  description: string | null;
  side: string | null;
};

export default async function RunResults({ params }: { params: { runId: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const me = await getMe();
  const granted = me?.permissions ?? [];
  const has = (k: string) => user.isSuperAdmin || granted.includes(k);
  if (!has("ar-reconciliation.view")) redirect("/dashboard");
  const canExport = has("ar-reconciliation.report.export");

  const run = await apiGetOrNull<RunDetail>(`/api/runs/${params.runId}`);
  if (!run) notFound();

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
        <RunProgress runId={run.id} stages={run.stages} initialStage={run.stage} initialStatus={run.status} />
      </>
    );
  }

  const exRows = run.status === "failed" ? [] : await apiGet<ExRow[]>(`/api/runs/${run.id}/exceptions`);
  const resultRows = exRows.map((e) => ({
    id: e.id,
    reference: e.reference ?? "",
    description: e.description ?? "",
    category: e.categoryCode,
    severity: e.severity,
    amount: e.amount != null ? String(e.amount) : null,
    aiExplanation: e.aiExplanation,
    aiRecommendation: e.aiRecommendation,
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
            {run.createdAt.slice(0, 16).replace("T", " ")}
          </p>
        </div>
      </div>

      {run.status === "failed" ? (
        (() => {
          const raw = run.error ?? "";
          const m = raw.match(/^\[(ERR-[A-Z0-9]+)\]\s*(.*)$/s);
          const ref = m?.[1] ?? null;
          const msg = m?.[2] ?? raw;
          return (
            <div className={styles.failCard}>
              <div className={styles.failHead}>
                <span className={styles.failIco}>✕</span>
                <div>
                  <b>Reconciliation failed</b>
                  <p>{msg || "Something went wrong while processing this run."}</p>
                </div>
              </div>
              {ref && (
                <div className={styles.failRef}>
                  <span>Error reference</span>
                  <code>{ref}</code>
                  <small>Share this reference with support to trace the exact error.</small>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <>
          {canExport && run.status === "completed" && (
            <div className={styles.reports}>
              <div className={styles.reportsLeft}>
                <span className={styles.reportsIco}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <b>Reports ready</b>
                  <small>Colour-coded reconciliation, exceptions and totals — ready to download.</small>
                </div>
              </div>
              <div className={styles.reportsBtns}>
                <a href={`/ar-reconciliation/${run.id}/source/statement`} className={`${styles.btn} ${styles.btnGhost}`}>⭳ Statement</a>
                <a href={`/ar-reconciliation/${run.id}/source/customer`} className={`${styles.btn} ${styles.btnGhost}`}>⭳ Ledger</a>
                <a href={`/ar-reconciliation/${run.id}/export/pdf`} className={styles.btn}>⭳ PDF</a>
                <a href={`/ar-reconciliation/${run.id}/export`} className={`${styles.btn} ${styles.btnPrimary}`}>⭳ Excel</a>
              </div>
            </div>
          )}

          <div className={styles.kpis}>
            <div className={`${styles.kpi} ${styles.kpiBlue}`}>
              <span className={styles.kStripe} />
              <div className={styles.kLab}>Auto-match rate</div>
              <div className={styles.kVal}>{run.autoMatchPct != null ? `${Number(run.autoMatchPct).toFixed(1)}%` : "—"}</div>
              <div className={styles.kFoot}>{run.counts.lines} lines · {run.counts.matches} matches</div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiGreen}`}>
              <span className={styles.kStripe} />
              <div className={styles.kLab}>Matched value</div>
              <div className={styles.kVal} style={{ fontSize: 21 }}>{aed(run.matchedValue)}</div>
              <div className={styles.kFoot}>Reconciled by rule</div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiCoral}`}>
              <span className={styles.kStripe} />
              <div className={styles.kLab}>Open exceptions</div>
              <div className={styles.kVal}>{run.counts.exceptionsOpen}</div>
              <div className={styles.kFoot}>of {run.counts.exceptionsTotal} total</div>
            </div>
            <div className={`${styles.kpi} ${styles.kpiViolet}`}>
              <span className={styles.kStripe} />
              <div className={styles.kLab}>Status</div>
              <div className={styles.kVal} style={{ fontSize: 19, textTransform: "capitalize" }}>{run.status}</div>
              <div className={styles.kFoot}>Rules first, AI on failures</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              Results ({resultRows.length})
              <span className={styles.help}>Exceptions found · colour-coded by severity</span>
            </div>
            <ResultsTable rows={resultRows} />
          </div>
        </>
      )}
    </>
  );
}
