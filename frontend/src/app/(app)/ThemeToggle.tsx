"use client";

import { useEffect, useState } from "react";
import styles from "./app.module.css";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const el = document.documentElement;
    const cur = el.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
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
    <button type="button" className={styles.themeToggle} onClick={toggle} title="Toggle theme">
      {theme === "dark" ? "☾" : "☀"} <span>{theme === "dark" ? "Dark" : "Light"} mode</span>
    </button>
  );
}
