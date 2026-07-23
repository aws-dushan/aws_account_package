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
  const stateOf = (i: number) => (i < currentIdx ? styles.stepDone : i === currentIdx ? styles.stepActive : styles.stepTodo);

  return (
    <div className={styles.card}>
      <div className={styles.cardPad}>
        <div className={styles.eyebrow}>{status === "failed" ? "Reconciliation failed" : "Reconciliation in progress"}</div>
        <h2 style={{ margin: "6px 0 18px", fontSize: 18 }}>{status === "failed" ? "Something went wrong" : "Working through the ledgers…"}</h2>
        <div className={styles.stepper}>
          {stages.map((s, i) => (
            <div key={s} className={`${styles.step} ${stateOf(i)}`}>
              <span className={styles.stepDot}>{i < currentIdx ? "✓" : i + 1}</span>
              <span className={styles.stepLabel}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
