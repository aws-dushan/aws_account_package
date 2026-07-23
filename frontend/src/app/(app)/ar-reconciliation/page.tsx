import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { apiGet } from "@/lib/api";
import styles from "../app.module.css";

const STATUS_CLASS: Record<string, string> = {
  completed: styles.badgeOk,
  running: styles.badgeAdmin,
  queued: styles.badgeAdmin,
  failed: styles.sevR,
  draft: styles.badgeOff,
};

type RunRow = {
  id: string;
  name: string;
  status: string;
  autoMatchPct: number | null;
  createdAt: string;
  tenantId: string;
};
type Company = { id: string; name: string };

export default async function ArHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const me = await getMe();
  const granted = me?.permissions ?? [];
  if (!user.isSuperAdmin && !granted.includes("ar-reconciliation.view")) redirect("/dashboard");
  const canCreate = user.isSuperAdmin || granted.includes("ar-reconciliation.run.create");

  const rows = await apiGet<RunRow[]>("/api/runs");
  const companyMap = new Map<string, string>();
  if (user.isSuperAdmin) {
    const companies = await apiGet<Company[]>("/api/companies").catch(() => [] as Company[]);
    companies.forEach((c) => companyMap.set(c.id, c.name));
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Module</div>
          <h1>AR Reconciliation</h1>
          <p>Reconcile a Statement of Account against a Customer Ledger.</p>
        </div>
        {canCreate && (
          <Link href="/ar-reconciliation/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            + New reconciliation
          </Link>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>Runs ({rows.length})</div>
        <div className={styles.tableWrap}>
          {rows.length === 0 ? (
            <div className={styles.empty}>
              No reconciliations yet.{canCreate ? " Start one with “New reconciliation”." : ""}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Run</th>
                  {user.isSuperAdmin && <th>Company</th>}
                  <th>Status</th>
                  <th className="num" style={{ textAlign: "right" }}>Auto-match</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/ar-reconciliation/${r.id}`} style={{ fontWeight: 700, color: "var(--brand-3)" }}>
                        {r.name}
                      </Link>
                    </td>
                    {user.isSuperAdmin && <td style={{ color: "var(--ink-2)" }}>{companyMap.get(r.tenantId) ?? "—"}</td>}
                    <td>
                      <span className={`${styles.badge} ${STATUS_CLASS[r.status] ?? styles.badgeOff}`}>{r.status}</span>
                    </td>
                    <td className={styles.mono} style={{ textAlign: "right" }}>
                      {r.autoMatchPct != null ? `${Number(r.autoMatchPct).toFixed(1)}%` : "—"}
                    </td>
                    <td className={styles.mono} style={{ color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                      {r.createdAt.slice(0, 16).replace("T", " ")}
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
