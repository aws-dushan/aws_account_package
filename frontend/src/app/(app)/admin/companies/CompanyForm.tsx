"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createCompany, type FormState } from "./actions";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Creating…" : "Create company"}
    </button>
  );
}

export default function CompanyForm() {
  const [state, action] = useFormState<FormState, FormData>(createCompany, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className={styles.form}>
      {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
      {state.ok && <div className={`${styles.alert} ${styles.alertOk}`}>{state.ok}</div>}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">Company name</label>
        <input id="name" name="name" className={styles.input} placeholder="e.g. NEOMART Hypermarket" required />
        <span className={styles.help}>A URL slug is generated automatically.</span>
      </div>
      <Submit />
    </form>
  );
}
