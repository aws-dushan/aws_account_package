import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { MODULES } from "@/modules/registry";
import NavLinks, { type NavSection } from "./NavLinks";
import Topbar from "./Topbar";
import styles from "./app.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const me = await getMe();
  const granted = me?.permissions ?? [];
  const tenantSlug = me?.tenantSlug ?? null;
  const moduleItems = MODULES.filter(
    (m) => user.isSuperAdmin || granted.includes(`${m.key}.view`),
  ).map((m) => ({ href: m.href, label: m.name }));

  const sections: NavSection[] = [
    { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard" }] },
  ];
  if (moduleItems.length) sections.push({ title: "Modules", items: moduleItems });
  if (user.isAdmin) {
    const adminItems = [
      { href: "/admin/companies", label: "Companies" },
      { href: "/admin/users", label: "Users" },
    ];
    if (user.isSuperAdmin) {
      adminItems.push({ href: "/admin/ai-settings", label: "AI Settings" });
      adminItems.push({ href: "/admin/audit", label: "Audit Log" });
    }
    sections.push({ title: "Administration", items: adminItems });
  }

  const displayName = user.name || user.username;
  const role = user.isSuperAdmin ? "Super-admin · ERP team" : tenantSlug || "Company user";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandTile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="AWS Distribution" />
          </span>
          <span className={styles.brandName}>
            <b>AWS Accounting</b>
            <small>Platform</small>
          </span>
        </div>
        <NavLinks sections={sections} />
      </aside>

      <div className={styles.content}>
        <Topbar name={displayName} role={role} />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
