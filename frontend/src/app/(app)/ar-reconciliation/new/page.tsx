import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { apiGet } from "@/lib/api";
import NewRunForm from "./NewRunForm";
import styles from "../../app.module.css";

type Company = { id: string; name: string; isActive: boolean };

export default async function NewRunPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const me = await getMe();
  const granted = me?.permissions ?? [];
  if (!user.isSuperAdmin && !granted.includes("ar-reconciliation.run.create")) redirect("/ar-reconciliation");

  const companies = user.isSuperAdmin
    ? (await apiGet<Company[]>("/api/companies")).filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))
    : [];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>AR Reconciliation</div>
          <h1>New reconciliation</h1>
          <p>Upload the two ledgers as Excel, CSV or PDF. Columns are detected and learned automatically (AI-assisted for unusual formats and scanned PDFs).</p>
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardPad}>
          <NewRunForm companies={companies} isSuperAdmin={user.isSuperAdmin} />
        </div>
      </div>
    </>
  );
}
