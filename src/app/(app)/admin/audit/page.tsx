import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { currentUser } from "@/lib/session";
import styles from "../../app.module.css";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "company.create": "Created company",
  "company.enable": "Enabled company",
  "company.disable": "Disabled company",
  "user.create": "Created user",
  "user.enable": "Enabled user",
  "user.disable": "Disabled user",
  "user.reset_password": "Reset password",
  "user.permissions.set": "Set permissions",
  "ai.settings.save": "Saved AI settings",
};

export default async function AuditPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.isSuperAdmin) redirect("/dashboard");

  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>Audit Log</h1>
          <p>Every login and administrative change, most recent first (last 200).</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>Recent activity ({rows.length})</div>
        <div className={styles.tableWrap}>
          {rows.length === 0 ? (
            <div className={styles.empty}>No activity recorded yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.mono} style={{ color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                      {r.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td>{r.actorUsername ?? "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontSize: 12, color: "var(--muted)", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.entity ? `${r.entity}${r.entityId ? ` · ${r.entityId}` : ""}` : ""}
                      {r.metadata ? ` ${JSON.stringify(r.metadata)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
