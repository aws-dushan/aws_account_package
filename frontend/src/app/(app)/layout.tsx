import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { MODULES } from "@/modules/registry";
import NavLinks, { type NavSection } from "./NavLinks";
import ThemeToggle from "./ThemeToggle";
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

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>D</span>
          <div>
            <b>AWS Accounting</b>
            <small>Platform</small>
          </div>
        </div>

        <NavLinks sections={sections} />

        <div className={styles.userBox}>
          <div className={styles.userInfo}>
            <span className={styles.avatar}>
              {(user.name || user.username).slice(0, 1).toUpperCase()}
            </span>
            <div className={styles.userMeta}>
              <b>{user.name || user.username}</b>
              <small>{user.isSuperAdmin ? "Super-admin · ERP team" : tenantSlug || "—"}</small>
            </div>
          </div>
          <ThemeToggle />
          <form action="/api/session/logout" method="post">
            <button type="submit" className={styles.signout} title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
