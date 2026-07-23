"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createUser, type FormState } from "./actions";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Creating…" : "Create user"}
    </button>
  );
}

export default function UserForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action] = useFormState<FormState, FormData>(createUser, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className={styles.form}>
      {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
      {state.ok && (
        <div className={`${styles.alert} ${styles.alertOk}`}>
          {state.ok} Temporary password: <b>{state.tempPassword}</b> — share it securely; the user
          must change it at first login.
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="displayName">Full name</label>
        <input id="displayName" name="displayName" className={styles.input} placeholder="e.g. Sara Ahmed" required />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="username">Username</label>
        <input id="username" name="username" className={styles.input} placeholder="e.g. s.ahmed" autoComplete="off" required />
        <span className={styles.help}>3–64 chars: letters, numbers, _ . -</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="assignment">Company</label>
        <select id="assignment" name="assignment" className={styles.select} required defaultValue="">
          <option value="" disabled>Select a company…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="__platform__">— Platform super-admin (ERP team, no company) —</option>
        </select>
      </div>

      <Submit />
    </form>
  );
}
