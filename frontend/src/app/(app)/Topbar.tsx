"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app.module.css";

function initialsOf(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

// Back link: shown on detail/sub-routes, points one segment up (the list page).
function useBack(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean);
  const deep = seg.length >= 3 || (seg.length >= 2 && seg[0] !== "admin");
  if (!deep) return null;
  return "/" + seg.slice(0, -1).join("/");
}

export default function Topbar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const back = useBack(pathname);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.documentElement;
    const cur = el.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        {back && (
          <Link href={back} className={styles.backBtn} aria-label="Go back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>
        )}
      </div>

      <div className={styles.topbarRight}>
        <button type="button" className={styles.iconBtn} onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {theme === "dark" ? "☾" : "☀"}
        </button>

        <div className={styles.userMenuWrap} ref={menuRef}>
          <button type="button" className={styles.userChip} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
            <span className={styles.chipAvatar}>{initialsOf(name)}</span>
            <span className={styles.chipMeta}>
              <b>{name}</b>
              <small>{role}</small>
            </span>
            <svg className={styles.chipCaret} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 4.5L6 7.5l3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {open && (
            <div className={styles.userMenu} role="menu">
              <div className={styles.userMenuHead}>
                <span className={styles.chipAvatarLg}>{initialsOf(name)}</span>
                <div>
                  <b>{name}</b>
                  <small>{role}</small>
                </div>
              </div>
              <Link href="/change-password" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
                <span>🔑</span> Change password
              </Link>
              <form action="/api/session/logout" method="post">
                <button type="submit" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem">
                  <span>⏻</span> Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
