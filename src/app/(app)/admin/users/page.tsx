import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { setUserActive } from "./actions";
import UserForm from "./UserForm";
import styles from "../../app.module.css";

export default async function UsersPage() {
  const me = await currentUser();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      isActive: users.isActive,
      tenantName: tenants.name,
    })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .orderBy(desc(users.createdAt));

  const companies = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.isActive, true))
    .orderBy(tenants.name);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>Users</h1>
          <p>Create accounts, assign each to a company, then set permissions.</p>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>All users ({rows.length})</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users/${u.id}`} style={{ fontWeight: 700, color: "var(--brand-3)" }}>
                        {u.displayName}
                      </Link>
                      <div className={styles.mono} style={{ fontSize: 12, color: "var(--muted)" }}>
                        {u.username}
                        {u.isAdmin && (
                          <span className={`${styles.badge} ${styles.badgeAdmin}`} style={{ marginLeft: 8 }}>
                            {u.tenantName ? "Admin" : "Super-admin"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-2)" }}>{u.tenantName ?? "— platform —"}</td>
                    <td>
                      <span className={`${styles.badge} ${u.isActive ? styles.badgeOk : styles.badgeOff}`}>
                        {u.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link href={`/admin/users/${u.id}`} className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}>
                          Manage
                        </Link>
                        {me?.id !== u.id && (
                          <form action={setUserActive.bind(null, u.id, !u.isActive)}>
                            <button type="submit" className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost} ${styles.btnDanger}`}>
                              {u.isActive ? "Disable" : "Enable"}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>New user</div>
          <div className={styles.cardPad}>
            {companies.length === 0 ? (
              <div className={styles.empty}>Create a company first, then add users to it.</div>
            ) : (
              <UserForm companies={companies} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
