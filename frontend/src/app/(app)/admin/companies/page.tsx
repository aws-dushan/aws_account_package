import { apiGet } from "@/lib/api";
import { setCompanyActive } from "./actions";
import CompanyForm from "./CompanyForm";
import styles from "../../app.module.css";

type Company = { id: string; name: string; slug: string; isActive: boolean };

export default async function CompaniesPage() {
  const rows = await apiGet<Company[]>("/api/companies");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>Companies</h1>
          <p>Each company is a tenant. Users and data are isolated per company.</p>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>All companies ({rows.length})</div>
          <div className={styles.tableWrap}>
            {rows.length === 0 ? (
              <div className={styles.empty}>No companies yet. Create one on the right.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b></td>
                      <td className={styles.mono} style={{ color: "var(--ink-2)" }}>{c.slug}</td>
                      <td>
                        <span className={`${styles.badge} ${c.isActive ? styles.badgeOk : styles.badgeOff}`}>
                          {c.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <form action={setCompanyActive.bind(null, c.id, !c.isActive)}>
                            <button type="submit" className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}>
                              {c.isActive ? "Disable" : "Enable"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>New company</div>
          <div className={styles.cardPad}>
            <CompanyForm />
          </div>
        </div>
      </div>
    </>
  );
}
