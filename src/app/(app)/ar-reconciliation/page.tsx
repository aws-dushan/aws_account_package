import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import styles from "../app.module.css";

export default async function ArReconciliationPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Permission-gated: needs the module's "view" capability (super-admins bypass).
  if (!(await can(user, "ar-reconciliation.view"))) redirect("/dashboard");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Module</div>
          <h1>AR Reconciliation</h1>
          <p>The reconciliation engine, dashboard and exception queue arrive in Phase 2.</p>
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.empty}>
          This module is scaffolded and permission-gated. Building the engine is Phase 2.
        </div>
      </div>
    </>
  );
}
