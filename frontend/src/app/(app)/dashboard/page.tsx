import Link from "next/link";
import { currentUser } from "@/lib/session";
import { getMe } from "@/lib/permissions";
import { MODULES } from "@/modules/registry";
import styles from "../app.module.css";

const Arrow = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M3 8h9M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Per-module presentation (registry stays logic-only; copy + icon live here).
const MODULE_META: Record<string, { desc: string; icon: JSX.Element }> = {
  "ar-reconciliation": {
    desc: "Reconcile a Statement of Account against a Customer Ledger, review exceptions and export reports.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 7h10M4 12h10M4 17h6" strokeLinecap="round" />
        <path d="M17 8l2.5 2.5L17 13M20 8l-2.5 2.5L20 13" strokeLinecap="round" strokeLinejoin="round" transform="translate(-1 4)" />
        <circle cx="18.5" cy="7.5" r="3.5" />
        <path d="M17 7.5l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

const BuildingIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M4 20h16M6 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M14 20V9h3a1 1 0 0 1 1 1v10" strokeLinejoin="round" />
    <path d="M9 8h2M9 12h2" strokeLinecap="round" />
  </svg>
);
const UsersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3.3 2.5-5.2 5.5-5.2s5.5 1.9 5.5 5.2" strokeLinecap="round" />
    <path d="M16 5.2A3 3 0 0 1 16 11M17 13.5c2.4.4 4 2.1 4 4.5" strokeLinecap="round" />
  </svg>
);
const SparkIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3z" strokeLinejoin="round" />
    <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" strokeLinejoin="round" />
  </svg>
);
const AuditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4" strokeLinecap="round" />
  </svg>
);

export default async function Dashboard() {
  const user = await currentUser();
  const me = await getMe();
  const granted = me?.permissions ?? [];
  const isSuper = !!user?.isSuperAdmin;

  const modules = MODULES.filter((m) => isSuper || granted.includes(`${m.key}.view`));

  const adminCards = user?.isAdmin
    ? [
        { href: "/admin/companies", title: "Companies", desc: "Create and manage the companies (tenants) on the platform.", icon: BuildingIcon },
        { href: "/admin/users", title: "Users", desc: "Create accounts, assign a company, and set per-user permissions.", icon: UsersIcon },
        ...(isSuper
          ? [
              { href: "/admin/ai-settings", title: "AI Settings", desc: "Configure AI providers and keys for matching and vision.", icon: SparkIcon },
              { href: "/admin/audit", title: "Audit Log", desc: "Review every administrative action and sign-in event.", icon: AuditIcon },
            ]
          : []),
      ]
    : [];

  const PASTEL = [styles.iconViolet, styles.iconBlue, styles.iconGreen, styles.iconAmber, styles.iconCoral];

  return (
    <>
      <section className={styles.hero}>
        <span className={`${styles.heroLight} ${styles.hl1}`} aria-hidden />
        <span className={`${styles.heroLight} ${styles.hl2}`} aria-hidden />
        <span className={`${styles.heroLight} ${styles.hl3}`} aria-hidden />
        <span className={`${styles.heroLight} ${styles.hl4}`} aria-hidden />
        <span className={`${styles.heroLight} ${styles.hl5}`} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <div className={styles.heroEyebrow}>AWS Accounting Platform</div>
            <h1>Welcome back, {user?.name || user?.username}.</h1>
            <p className={styles.heroSub}>
              {isSuper
                ? "You have full platform access. Open a module or manage the platform below."
                : modules.length
                ? "Everything you need is one click away. Open a module below to get started."
                : "You don’t have any modules yet — an administrator will grant you access shortly."}
            </p>
          </div>
        </div>
      </section>

      {modules.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Your modules</div>
          <div className={styles.homeGrid}>
            {modules.map((m, i) => {
              const meta = MODULE_META[m.key];
              return (
                <Link key={m.key} href={m.href} className={`${styles.homeCard} ${PASTEL[i % PASTEL.length]}`}>
                  <div className={styles.homeIcon}>{meta?.icon ?? BuildingIcon}</div>
                  <h2>{m.name}</h2>
                  <p>{meta?.desc ?? "Open module."}</p>
                  <div className={styles.homeCardFoot}>
                    Open <Arrow />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {adminCards.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Administration</div>
          <div className={styles.homeGrid}>
            {adminCards.map((c, i) => (
              <Link key={c.href} href={c.href} className={`${styles.homeCard} ${PASTEL[(i + 1) % PASTEL.length]}`}>
                <div className={styles.homeIcon}>{c.icon}</div>
                <h2>{c.title}</h2>
                <p>{c.desc}</p>
                <div className={styles.homeCardFoot}>
                  Manage <Arrow />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
