"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveException, type ExceptionStatus } from "../actions";
import { CATEGORY_LABEL } from "@/modules/ar-reconciliation/labels";
import styles from "../../app.module.css";

export type ExceptionRow = {
  id: string;
  reference: string;
  description: string;
  side: string;
  category: string;
  severity: string;
  amount: string | null;
  status: string;
  note: string | null;
  aiExplanation?: string | null;
  aiRecommendation?: string | null;
  aiModel?: string | null;
};

const SEV: Record<string, string> = { g: styles.sevG, a: styles.sevA, c: styles.sevC, r: styles.sevR, n: styles.sevN };
const STATUS: Record<string, { cls: string; label: string }> = {
  open: { cls: styles.stOpen, label: "Open" },
  approved: { cls: styles.stApproved, label: "Approved" },
  adjusted: { cls: styles.stAdjusted, label: "Adjusted" },
  resolved: { cls: styles.stResolved, label: "Resolved" },
};
const aed = (v: string | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExceptionQueue({
  rows,
  canApprove,
  canAdjust,
}: {
  rows: ExceptionRow[];
  canApprove: boolean;
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<ExceptionRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function open(row: ExceptionRow) {
    setSel(row);
    setNote(row.note ?? "");
    setErr("");
  }

  async function act(status: ExceptionStatus) {
    if (!sel) return;
    setBusy(true);
    setErr("");
    const res = await resolveException({ exceptionId: sel.id, status, note });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setSel(null);
    router.refresh();
  }

  return (
    <>
      <div className={styles.tableWrap}>
        {rows.length === 0 ? (
          <div className={styles.empty}>No exceptions — everything reconciled. 🎉</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Description</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={styles.clickRow} onClick={() => open(e)}>
                  <td className={styles.mono} style={{ fontWeight: 600 }}>{e.reference || "—"}</td>
                  <td style={{ color: "var(--ink-2)" }}>{e.description || "—"}</td>
                  <td className={styles.mono} style={{ textAlign: "right" }}>{aed(e.amount)}</td>
                  <td>
                    <span className={`${styles.badge} ${SEV[e.severity] ?? styles.badgeOff}`}>
                      {CATEGORY_LABEL[e.category] ?? e.category}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STATUS[e.status]?.cls ?? styles.badgeOff}`}>
                      {STATUS[e.status]?.label ?? e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sel && (
        <div className={styles.drawerOverlay} onClick={() => setSel(null)}>
          <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3>{sel.reference || "Exception"}</h3>
                <div className="sub">{CATEGORY_LABEL[sel.category] ?? sel.category}</div>
              </div>
              <button className={styles.drawerX} onClick={() => setSel(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.dRow}><span className="dK">Description</span><span className="dV">{sel.description || "—"}</span></div>
              <div className={styles.dRow}><span className="dK">Side</span><span className="dV">{sel.side === "statement" ? "Statement" : sel.side === "customer" ? "Customer" : "—"}</span></div>
              <div className={styles.dRow}><span className="dK">Amount</span><span className="dV">{aed(sel.amount)}</span></div>
              <div className={styles.dRow}>
                <span className="dK">Status</span>
                <span className={`${styles.badge} ${STATUS[sel.status]?.cls ?? styles.badgeOff}`}>{STATUS[sel.status]?.label ?? sel.status}</span>
              </div>

              <div className={styles.aiPanel}>
                {sel.aiExplanation ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div><b>✦ Why it didn’t reconcile.</b> {sel.aiExplanation}</div>
                    {sel.aiRecommendation && <div><b>Recommended action.</b> {sel.aiRecommendation}</div>}
                    {sel.aiModel && <div style={{ fontSize: 11, opacity: 0.7 }}>Generated by {sel.aiModel}</div>}
                  </div>
                ) : (
                  <>✦ No AI insight yet. Use “Generate AI insights” on the run (requires a configured AI provider).</>
                )}
              </div>

              <div>
                <label className={styles.label} style={{ display: "block", marginBottom: 6 }}>Resolution note</label>
                <textarea
                  className={styles.noteArea}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note about how this was resolved…"
                  disabled={busy || (!canApprove && !canAdjust)}
                />
              </div>

              {err && <div className={`${styles.alert} ${styles.alertErr}`}>{err}</div>}

              {canApprove || canAdjust ? (
                <div className={styles.drawerActions}>
                  {canApprove && <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => act("approved")}>Approve</button>}
                  {canAdjust && <button className={`${styles.btn}`} disabled={busy} onClick={() => act("adjusted")}>Mark adjusted</button>}
                  {canApprove && <button className={`${styles.btn}`} disabled={busy} onClick={() => act("resolved")}>Resolve</button>}
                  {canApprove && sel.status !== "open" && <button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => act("open")}>Reopen</button>}
                </div>
              ) : (
                <div className={styles.help}>You have view-only access to this exception.</div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
