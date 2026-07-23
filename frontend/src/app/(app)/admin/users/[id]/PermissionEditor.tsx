"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setUserPermissions, type FormState } from "../actions";
import { MODULES } from "@/modules/registry";
import styles from "../../../app.module.css";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </button>
  );
}

export default function PermissionEditor({
  userId,
  granted,
}: {
  userId: string;
  granted: string[];
}) {
  const [state, action] = useFormState<FormState, FormData>(setUserPermissions, {});
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      {MODULES.map((m) => (
        <div key={m.key} className={styles.permModule}>
          <div className={styles.permModuleHead}>{m.name}</div>
          <div className={styles.permGrid}>
            {m.features.map((f) => {
              const key = `${m.key}.${f.key}`;
              return (
                <label key={key} className={styles.permItem}>
                  <input type="checkbox" name="perm" value={key} defaultChecked={granted.includes(key)} />
                  {f.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
        <Save />
        {state.ok && <span className={`${styles.badge} ${styles.badgeOk}`}>{state.ok}</span>}
        {state.error && <span className={`${styles.badge} ${styles.badgeOff}`}>{state.error}</span>}
      </div>
    </form>
  );
}
