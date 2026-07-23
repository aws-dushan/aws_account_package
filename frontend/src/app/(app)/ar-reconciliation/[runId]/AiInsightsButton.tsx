"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateInsights } from "../actions";
import styles from "../../app.module.css";

export default function AiInsightsButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    const r = await generateInsights(runId);
    setBusy(false);
    if (r.error) {
      setErr(r.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button
        className={styles.btn}
        onClick={go}
        disabled={busy}
        style={{ borderColor: "var(--ai-bd)", color: "var(--ai-ink)", background: "var(--ai-fill)" }}
      >
        {busy ? "Generating…" : "✦ Generate AI insights"}
      </button>
      {err && <span className={styles.help} style={{ color: "var(--r-ink)", maxWidth: 280, textAlign: "right" }}>{err}</span>}
    </div>
  );
}
