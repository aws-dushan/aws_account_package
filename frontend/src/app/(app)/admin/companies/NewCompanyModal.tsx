"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { createCompany, type FormState } from "./actions";
import Modal from "../../Modal";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Creating…" : "Create company"}
    </button>
  );
}

export default function NewCompanyModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<FormState, FormData>(createCompany, {});

  useEffect(() => {
    if (state.ok && open) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, open, router]);

  return (
    <>
      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setOpen(true)}>
        + New company
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New company" subtitle="Each company is an isolated tenant.">
        <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
          {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Company name</label>
            <input id="name" name="name" className={styles.input} placeholder="e.g. NEOMART Hypermarket" required autoFocus />
            <span className={styles.help}>A URL slug is generated automatically.</span>
          </div>
          <div className={styles.drawerActions}>
            <Submit />
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
