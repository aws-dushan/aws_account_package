"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createRun, type FormState } from "../actions";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Uploading…" : "Continue → confirm mapping"}
    </button>
  );
}

export default function NewRunForm({
  companies,
  isSuperAdmin,
}: {
  companies: { id: string; name: string }[];
  isSuperAdmin: boolean;
}) {
  const [state, action] = useFormState<FormState, FormData>(createRun, {});
  return (
    <form action={action} className={styles.form} style={{ maxWidth: 560 }}>
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
          <input name="statement" type="file" accept=".xlsx,.xls,.csv" className={styles.input} style={{ paddingTop: 12 }} required />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Customer Ledger</label>
          <input name="customer" type="file" accept=".xlsx,.xls,.csv" className={styles.input} style={{ paddingTop: 12 }} required />
        </div>
      </div>

      <Submit />
    </form>
  );
}
