import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { currentUser } from "@/lib/session";
import { getUserPermissionKeys } from "@/lib/permissions";
import { MODULES } from "@/modules/registry";
import NavLinks, { type NavSection } from "./NavLinks";
import styles from "./app.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const granted = user.isSuperAdmin ? [] : await getUserPermissionKeys(user.id);
  const moduleItems = MODULES.filter(
    (m) => user.isSuperAdmin || granted.includes(`${m.key}.view`),
  ).map((m) => ({ href: m.href, label: m.name }));

  const sections: NavSection[] = [
    { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard" }] },
  ];
  if (moduleItems.length) sections.push({ title: "Modules", items: moduleItems });
  if (user.isAdmin) {
    sections.push({
      title: "Administration",
      items: [
        { href: "/admin/companies", label: "Companies" },
        { href: "/admin/users", label: "Users" },
      ],
    });
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
              <small>{user.isSuperAdmin ? "Super-admin · ERP team" : user.tenantSlug || "—"}</small>
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
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
