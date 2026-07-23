"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { resetUserPassword, type FormState } from "./actions";
import Modal from "../../Modal";
import styles from "../../app.module.css";

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`} disabled={pending}>
      {pending ? "Resetting…" : "Reset password"}
    </button>
  );
}

export default function ResetPasswordButton({ userId, displayName }: { userId: string; displayName: string }) {
  const [state, action] = useFormState<FormState, FormData>(resetUserPassword, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.tempPassword || state.error) setOpen(true);
  }, [state.tempPassword, state.error]);

  return (
    <>
      <form action={action} style={{ display: "inline" }}>
        <input type="hidden" name="userId" value={userId} />
        <Btn />
      </form>
      <Modal open={open} onClose={() => setOpen(false)} title="Password reset" subtitle={displayName}>
        {state.tempPassword && (
          <div className={`${styles.alert} ${styles.alertOk}`}>
            Temporary password: <b>{state.tempPassword}</b> — share it securely; the user must change it at next login.
          </div>
        )}
        {state.error && <div className={`${styles.alert} ${styles.alertErr}`}>{state.error}</div>}
        <div className={styles.drawerActions} style={{ marginTop: 16 }}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setOpen(false)}>Done</button>
        </div>
      </Modal>
    </>
  );
}
