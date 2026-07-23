"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../app.module.css";

export default function RunProgress({
  runId,
  stages,
  initialStage,
  initialStatus,
}: {
  runId: string;
  stages: string[];
  initialStage: string | null;
  initialStatus: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage ?? stages[0]);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const es = new EventSource(`/ar-reconciliation/${runId}/events`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { status?: string; stage?: string | null };
        if (d.stage) setStage(d.stage);
        if (d.status) setStatus(d.status);
        if (d.status === "completed" || d.status === "failed") {
          es.close();
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      setTimeout(() => router.refresh(), 1500);
    };
    return () => es.close();
  }, [runId, router, stages]);

  const currentIdx = Math.max(0, stages.indexOf(stage));
  // Progress fills across the run; the active stage counts as half-done.
  const pct = Math.min(100, Math.round(((currentIdx + 0.5) / stages.length) * 100));

  return (
    <div className={styles.proc}>
      <div className={styles.procTop}>
        <div className={styles.procOrb}>
          <span className={styles.procOrbDot} />
        </div>
        <div>
          <div className={styles.procEyebrow}>Reconciliation in progress</div>
          <h2 className={styles.procTitle}>{stage}</h2>
          <div className={styles.procSub}>
            This runs automatically — column mapping, matching and exceptions. You can leave and come back.
          </div>
        </div>
      </div>

      <div className={styles.procBarWrap}>
        <div className={styles.procBar} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.procMeta}>
        <span>
          Step {Math.min(currentIdx + 1, stages.length)} of {stages.length}
        </span>
        <span>{pct}%</span>
      </div>

      <div className={styles.procSteps}>
        {stages.map((s, i) => {
          const cls =
            i < currentIdx ? styles.procStepDone : i === currentIdx ? styles.procStepActive : "";
          return (
            <div key={s} className={`${styles.procStep} ${cls}`}>
              <span className={styles.procStepIco}>{i < currentIdx ? "✓" : i + 1}</span>
              {s}
            </div>
          );
        })}
      </div>
    </div>
  );
}
