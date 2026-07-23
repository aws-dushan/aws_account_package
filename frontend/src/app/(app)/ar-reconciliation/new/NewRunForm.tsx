"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { createRun, type FormState } from "../actions";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Starting…" : "Run reconciliation"}
    </button>
  );
}

export default function NewRunForm({
  companies,
  isSuperAdmin,
  onCreated,
}: {
  companies: { id: string; name: string }[];
  isSuperAdmin: boolean;
  onCreated?: (runId: string) => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState<FormState, FormData>(createRun, {});
  const [hasPdf, setHasPdf] = useState({ statement: false, customer: false });

  useEffect(() => {
    if (!state.runId) return;
    if (onCreated) onCreated(state.runId);
    else router.push(`/ar-reconciliation/${state.runId}`); // standalone /new page fallback
  }, [state.runId, onCreated, router]);

  const pdfSelected = hasPdf.statement || hasPdf.customer;
  const onPick = (which: "statement" | "customer") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const isPdf = (e.target.files?.[0]?.name ?? "").toLowerCase().endsWith(".pdf");
    setHasPdf((p) => ({ ...p, [which]: isPdf }));
  };

  return (
    <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
      {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}

      {isSuperAdmin && (
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <select name="companyId" className={styles.select} required defaultValue="">
            <option value="" disabled>Select a company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Reconciliation name</label>
        <input name="name" className={styles.input} placeholder="e.g. NEOMART — Q1 2025" required />
      </div>

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.label}>Statement of Account</label>
          <input name="statement" type="file" accept=".xlsx,.xls,.csv,.pdf" className={styles.fileInput} onChange={onPick("statement")} required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Customer Ledger</label>
          <input name="customer" type="file" accept=".xlsx,.xls,.csv,.pdf" className={styles.fileInput} onChange={onPick("customer")} required />
        </div>
      </div>

      {pdfSelected && (
        <div className={styles.pdfWarn}>
          <span>ⓘ</span>
          <div>
            <b>PDF is read using AI.</b> PDF statements are extracted with your configured AI provider (Admin → AI Settings)
            and may use API credits. For instant, no-AI processing, upload <b>Excel or CSV</b> instead.
          </div>
        </div>
      )}

      <Submit />
    </form>
  );
}
