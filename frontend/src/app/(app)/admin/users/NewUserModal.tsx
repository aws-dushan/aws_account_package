"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { createUser, type FormState } from "./actions";
import Modal from "../../Modal";
import styles from "../../app.module.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Creating…" : "Create user"}
    </button>
  );
}

export default function NewUserModal({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<FormState, FormData>(createUser, {});

  function close() {
    setOpen(false);
    if (state.ok) router.refresh(); // refresh the list once a user was created
  }

  const disabled = companies.length === 0;

  return (
    <>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Create a company first" : undefined}
      >
        + New user
      </button>
      <Modal open={open} onClose={close} title="New user" subtitle="Assign to a company or make a platform super-admin.">
        {state.ok ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className={`${styles.alert} ${styles.alertOk}`}>
              {state.ok} Temporary password: <b>{state.tempPassword}</b> — share it securely; the user must
              change it at first login.
            </div>
            <div className={styles.drawerActions}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={close}>Done</button>
            </div>
          </div>
        ) : (
          <form action={action} className={styles.form} style={{ maxWidth: "none" }}>
            {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="displayName">Full name</label>
              <input id="displayName" name="displayName" className={styles.input} placeholder="e.g. Sara Ahmed" required autoFocus />
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
            <div className={styles.drawerActions}>
              <Submit />
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={close}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
