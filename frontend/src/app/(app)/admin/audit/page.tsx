import { apiGet } from "@/lib/api";
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
  "user.change_password": "Changed password",
  "user.permissions.set": "Set permissions",
  "ai.settings.save": "Saved AI settings",
  "run.create": "Created run",
  "run.export": "Exported report",
};

type AuditRow = {
  id: string;
  actorUsername: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: string | null;
  createdAt: string;
};

export default async function AuditPage() {
  const rows = await apiGet<AuditRow[]>("/api/audit");

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
                      {r.createdAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td>{r.actorUsername ?? "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontSize: 12, color: "var(--muted)", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.entity ? `${r.entity}${r.entityId ? ` · ${r.entityId}` : ""}` : ""}
                      {r.metadata ? ` ${r.metadata}` : ""}
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
