"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { resolveException, confirmSuggestion, type ExceptionStatus } from "../actions";
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
  ai_suggested: { cls: styles.badgeAdmin, label: "✦ AI suggested" },
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 46, overscan: 12 });

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

  async function confirmSug(accept: boolean) {
    if (!sel) return;
    setBusy(true);
    setErr("");
    const res = await confirmSuggestion({ exceptionId: sel.id, accept });
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
      {rows.length === 0 ? (
        <div className={styles.empty}>No exceptions — everything reconciled. 🎉</div>
      ) : (
        <div>
          <div className={styles.vHead}>
            <div>Reference</div>
            <div>Description</div>
            <div className={styles.vRight}>Amount</div>
            <div>Category</div>
            <div>Status</div>
          </div>
          <div ref={scrollRef} className={styles.vScroll}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const e = rows[vi.index];
                return (
                  <div key={e.id} className={styles.vRow} style={{ transform: `translateY(${vi.start}px)` }} onClick={() => open(e)}>
                    <div className={`${styles.mono} ${styles.vCell}`} style={{ fontWeight: 600 }}>{e.reference || "—"}</div>
                    <div className={styles.vCell} style={{ color: "var(--ink-2)" }}>{e.description || "—"}</div>
                    <div className={`${styles.mono} ${styles.vRight}`}>{aed(e.amount)}</div>
                    <div><span className={`${styles.badge} ${SEV[e.severity] ?? styles.badgeOff}`}>{CATEGORY_LABEL[e.category] ?? e.category}</span></div>
                    <div><span className={`${styles.badge} ${STATUS[e.status]?.cls ?? styles.badgeOff}`}>{STATUS[e.status]?.label ?? e.status}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

              {sel.status === "ai_suggested" ? (
                canApprove ? (
                  <div className={styles.drawerActions}>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => confirmSug(true)}>Confirm match</button>
                    <button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => confirmSug(false)}>Reject</button>
                  </div>
                ) : (
                  <div className={styles.help}>An approver must confirm this AI-suggested match.</div>
                )
              ) : canApprove || canAdjust ? (
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
