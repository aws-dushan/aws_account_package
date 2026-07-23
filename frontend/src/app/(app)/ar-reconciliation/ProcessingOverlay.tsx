"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "../app.module.css";

const STAGES = ["Reading files", "Resolving columns", "Matching", "Saving results", "AI matching", "AI insights", "Completed"];

/**
 * Full-screen blurred overlay shown while a run processes — no separate page.
 * Streams live progress (SSE). On success it navigates to the results; on failure
 * it stays put and shows the error reference code, right here in the popup.
 */
export default function ProcessingOverlay({
  runId,
  onDone,
  onClose,
}: {
  runId: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState(STAGES[0]);
  const [status, setStatus] = useState("running");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let done = false;
    const es = new EventSource(`/ar-reconciliation/${runId}/events`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { status?: string; stage?: string | null; error?: string | null };
        if (d.stage) setStage(d.stage);
        if (d.status) setStatus(d.status);
        if (d.status === "completed") {
          done = true;
          es.close();
          setTimeout(onDone, 550); // let the last step tick green
        } else if (d.status === "failed") {
          done = true;
          es.close();
          setStatus("failed");
          setError(d.error ?? null); // stay in the popup and show the code
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      // Only assume completion if we didn't already resolve to a failure.
      if (!done) setTimeout(onDone, 1200);
    };
    return () => es.close();
  }, [runId, onDone]);

  if (!mounted) return null;

  const currentIdx = Math.max(0, STAGES.indexOf(stage));
  const pct = status === "completed" ? 100 : Math.min(100, Math.round(((currentIdx + 0.5) / STAGES.length) * 100));
  const failed = status === "failed";
  const ref = error?.match(/ERR-[A-Z0-9]+/)?.[0] ?? null;

  return createPortal(
    <div className={styles.procOverlay}>
      <div className={styles.proc} style={{ width: "min(520px, 100%)" }}>
        <div className={styles.procTop}>
          {!failed ? (
            <div className={styles.procOrb}><span className={styles.procOrbDot} /></div>
          ) : (
            <div className={`${styles.procOrb} ${styles.procOrbFail}`}>✕</div>
          )}
          <div>
            <div className={styles.procEyebrow}>{failed ? "Reconciliation failed" : "Reconciliation in progress"}</div>
            <h2 className={styles.procTitle}>{failed ? "Couldn’t complete this run" : stage}</h2>
            {!failed && (
              <div className={styles.procSub}>Mapping, matching and exceptions — all automatic. Hang tight…</div>
            )}
          </div>
        </div>

        {!failed && (
          <>
            <div className={styles.procBarWrap}>
              <div className={styles.procBar} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.procMeta}>
              <span>Step {Math.min(currentIdx + 1, STAGES.length)} of {STAGES.length}</span>
              <span>{pct}%</span>
            </div>
            <div className={styles.procSteps}>
              {STAGES.map((sName, i) => {
                const cls = i < currentIdx ? styles.procStepDone : i === currentIdx ? styles.procStepActive : "";
                return (
                  <div key={sName} className={`${styles.procStep} ${cls}`}>
                    <span className={styles.procStepIco}>{i < currentIdx ? "✓" : i + 1}</span>
                    {sName}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {failed && (
          <>
            {ref && (
              <div className={styles.procRef}>
                <span>Error code</span>
                <code>{ref}</code>
              </div>
            )}
            <div className={styles.drawerActions} style={{ marginTop: 18 }}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
