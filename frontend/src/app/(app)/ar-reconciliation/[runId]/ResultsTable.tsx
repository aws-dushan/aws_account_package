import { CATEGORY_LABEL } from "@/modules/ar-reconciliation/labels";
import styles from "../../app.module.css";

export type ResultRow = {
  id: string;
  reference: string;
  description: string;
  category: string;
  severity: string;
  amount: string | null;
  aiExplanation?: string | null;
  aiRecommendation?: string | null;
};

const SEV: Record<string, string> = {
  g: styles.sevG,
  a: styles.sevA,
  c: styles.sevC,
  r: styles.sevR,
  n: styles.sevN,
};
const aed = (v: string | null) =>
  v == null ? "—" : "AED " + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Read-only reconciliation results — no actions; everything runs automatically. */
export default function ResultsTable({ rows }: { rows: ResultRow[] }) {
  if (rows.length === 0) {
    return <div className={styles.empty}>Everything reconciled — no exceptions to review. 🎉</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.resultsTable}>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Detail</th>
            <th>Category</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} data-sev={e.severity}>
              <td className={styles.mono} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{e.reference || "—"}</td>
              <td>
                <div>{e.description || "—"}</div>
                {e.aiExplanation && (
                  <div className={styles.aiNote}>
                    <b>✦</b> {e.aiExplanation}
                    {e.aiRecommendation ? ` — ${e.aiRecommendation}` : ""}
                  </div>
                )}
              </td>
              <td>
                <span className={`${styles.badge} ${SEV[e.severity] ?? styles.badgeOff}`}>
                  {CATEGORY_LABEL[e.category] ?? e.category}
                </span>
              </td>
              <td className={styles.mono} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{aed(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
