import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import NewRunForm from "./NewRunForm";
import styles from "../../app.module.css";

export default async function NewRunPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "ar-reconciliation.run.create"))) redirect("/ar-reconciliation");

  const companies = user.isSuperAdmin
    ? await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.isActive, true)).orderBy(tenants.name)
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
