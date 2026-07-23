import Link from "next/link";
import { currentUser } from "@/lib/session";
import styles from "../app.module.css";

export default async function Dashboard() {
  const user = await currentUser();
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>AWS Accounting Platform</div>
          <h1>Welcome, {user?.name || user?.username}.</h1>
          <p>
            {user?.isSuperAdmin
              ? "You have full platform access. Manage companies, users and permissions from Administration."
              : "Your available modules appear in the sidebar."}
          </p>
        </div>
      </div>

      {user?.isSuperAdmin && (
        <div className={styles.grid2}>
          <Link href="/admin/companies" className={styles.card} style={{ textDecoration: "none" }}>
            <div className={styles.cardPad}>
              <div className={styles.eyebrow}>Administration</div>
              <h2 style={{ margin: "8px 0 4px", fontSize: 18 }}>Companies</h2>
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5 }}>
                Create and manage the companies (tenants) on the platform.
              </p>
            </div>
          </Link>
          <Link href="/admin/users" className={styles.card} style={{ textDecoration: "none" }}>
            <div className={styles.cardPad}>
              <div className={styles.eyebrow}>Administration</div>
              <h2 style={{ margin: "8px 0 4px", fontSize: 18 }}>Users</h2>
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5 }}>
                Create user accounts, assign them to a company, and set permissions.
              </p>
            </div>
          </Link>
        </div>
      )}
    </>
  );
}
