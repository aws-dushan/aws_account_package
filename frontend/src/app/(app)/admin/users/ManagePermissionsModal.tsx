"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { setUserPermissions, type FormState } from "./actions";
import { MODULES } from "@/modules/registry";
import Modal from "../../Modal";
import styles from "../../app.module.css";

type Detail = {
  user: { id: string; displayName: string; username: string; isAdmin: boolean; tenantId: string | null };
  permissions: string[];
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </button>
  );
}

export default function ManagePermissionsModal({
  userId,
  displayName,
  username,
}: {
  userId: string;
  displayName: string;
  username: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [state, action] = useFormState<FormState, FormData>(setUserPermissions, {});

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setErr("");
    setDetail(null);
    try {
      const res = await fetch(`/admin/users/${userId}/permissions`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDetail((await res.json()) as Detail);
    } catch {
      setErr("Could not load this user’s permissions.");
    } finally {
      setLoading(false);
    }
  }
  function close() {
    setOpen(false);
    router.refresh();
  }

  const u = detail?.user;
  const isPlatformAdmin = !!u && u.isAdmin && !u.tenantId;
  const granted = detail?.permissions ?? [];

  return (
    <>
      <button type="button" className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`} onClick={openModal}>
        Manage
      </button>
      <Modal open={open} onClose={close} title={`Manage — ${displayName}`} subtitle={username} wide>
        {loading && <div className={styles.empty}>Loading…</div>}
        {err && <div className={`${styles.alert} ${styles.alertErr}`}>{err}</div>}
        {u &&
          (isPlatformAdmin ? (
            <div className={styles.empty}>
              This is a platform super-admin (ERP team) — full access to every module. Per-user permissions
              don’t apply.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
            </div>
          ))}
      </Modal>
    </>
  );
}
