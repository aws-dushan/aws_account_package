import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGetOrNull } from "@/lib/api";
import PermissionEditor from "./PermissionEditor";
import ResetPassword from "./ResetPassword";
import styles from "../../../app.module.css";

type UserDetail = {
  user: {
    id: string;
    username: string;
    displayName: string;
    isAdmin: boolean;
    isActive: boolean;
    mustChangePassword: boolean;
    tenantId: string | null;
    tenantName: string | null;
  };
  permissions: string[];
};

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const data = await apiGetOrNull<UserDetail>(`/api/users/${params.id}`);
  if (!data) notFound();
  const u = data.user;

  const isPlatformAdmin = u.isAdmin && !u.tenantId;
  const granted = isPlatformAdmin ? [] : data.permissions;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>
            <Link href="/admin/users" style={{ color: "var(--accent-ink)" }}>Users</Link> / Manage
          </div>
          <h1>{u.displayName}</h1>
          <p className={styles.mono}>{u.username}</p>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>Permissions</div>
          <div className={styles.cardPad}>
            {isPlatformAdmin ? (
              <div className={styles.empty}>
                This is a platform super-admin (ERP team) — full access to every module. Per-user
                permissions don’t apply.
              </div>
            ) : (
              <PermissionEditor userId={u.id} granted={granted} />
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>Account</div>
          <div className={styles.cardPad} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div className={styles.label}>Company</div>
              <div>{u.tenantName ?? "— platform (super-admin) —"}</div>
            </div>
            <div>
              <div className={styles.label}>Status</div>
              <span className={`${styles.badge} ${u.isActive ? styles.badgeOk : styles.badgeOff}`}>
                {u.isActive ? "Active" : "Disabled"}
              </span>
              {u.mustChangePassword && (
                <span className={`${styles.badge} ${styles.badgeAdmin}`} style={{ marginLeft: 8 }}>
                  Must change password
                </span>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--hair)", paddingTop: 14 }}>
              <div className={styles.label} style={{ marginBottom: 8 }}>Reset password</div>
              <ResetPassword userId={u.id} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
