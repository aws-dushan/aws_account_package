import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { apiGetOrNull, apiGet } from "@/lib/api";
import ExceptionQueue from "./ExceptionQueue";
import RunProgress from "./RunProgress";
import AiInsightsButton from "./AiInsightsButton";
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
  const canApprove = has("ar-reconciliation.exception.approve");
  const canAdjust = has("ar-reconciliation.exception.adjust");

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
  const queueRows = exRows.map((e) => ({
    id: e.id,
    reference: e.reference ?? "",
    description: e.description ?? "",
    side: e.side ?? "",
    category: e.categoryCode,
    severity: e.severity,
    amount: e.amount != null ? String(e.amount) : null,
    status: e.status,
    note: e.resolutionNote,
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
            {run.createdAt.slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {(canApprove || canAdjust) && queueRows.length > 0 && <AiInsightsButton runId={run.id} />}
          {canExport && run.status === "completed" && (
            <>
              <a href={`/ar-reconciliation/${run.id}/export/pdf`} className={styles.btn}>⭳ PDF</a>
              <a href={`/ar-reconciliation/${run.id}/export`} className={`${styles.btn} ${styles.btnPrimary}`}>⭳ Excel</a>
            </>
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
              <div className={styles.kFoot}>{run.counts.lines} lines · {run.counts.matches} matches</div>
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
              <div className={styles.kVal}>{run.counts.exceptionsOpen}</div>
              <div className={styles.kFoot}>of {run.counts.exceptionsTotal} total</div>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kStripe} style={{ background: "var(--brand-2)" }} />
              <div className={styles.kLab}>Status</div>
              <div className={styles.kVal} style={{ fontSize: 19, textTransform: "capitalize" }}>{run.status}</div>
              <div className={styles.kFoot}>Rules first, AI on failures</div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              Exception queue ({queueRows.length})
              {(canApprove || canAdjust) && <span className={styles.help}>Click a row to review & resolve</span>}
            </div>
            <ExceptionQueue rows={queueRows} canApprove={canApprove} canAdjust={canAdjust} />
          </div>
        </>
      )}
    </>
  );
}
