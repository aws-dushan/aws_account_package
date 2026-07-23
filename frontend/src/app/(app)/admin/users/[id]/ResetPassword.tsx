"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resetUserPassword, type FormState } from "../actions";
import styles from "../../../app.module.css";

function Btn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnGhost}`} disabled={pending}>
      {pending ? "Resetting…" : "Reset password"}
    </button>
  );
}

export default function ResetPassword({ userId }: { userId: string }) {
  const [state, action] = useFormState<FormState, FormData>(resetUserPassword, {});
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Btn />
      {state.tempPassword && (
        <div className={`${styles.alert} ${styles.alertOk}`} style={{ marginTop: 10 }}>
          Temporary password: <b>{state.tempPassword}</b> — share securely; must be changed at next login.
        </div>
      )}
      {state.error && (
        <div className={`${styles.alert} ${styles.alertErr}`} style={{ marginTop: 10 }}>{state.error}</div>
      )}
    </form>
  );
}
