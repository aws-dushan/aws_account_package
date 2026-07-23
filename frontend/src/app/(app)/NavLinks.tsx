"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app.module.css";

export type NavItem = { href: string; label: string };
export type NavSection = { title: string; items: NavItem[] };

export default function NavLinks({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav}>
      {sections.map((section) => (
        <div key={section.title} className={styles.navSection}>
          <div className={styles.navTitle}>{section.title}</div>
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
