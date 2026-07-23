"use client";

import styles from "./login.module.css";
import RibbonBackground from "./RibbonBackground";
import LoginForm from "./LoginForm";

const LIGHTS = [styles.l1, styles.l2, styles.l3, styles.l4, styles.l5, styles.l6, styles.l7, styles.l8];

export default function LoginPage() {
  return (
    <main className={styles.stage}>
      <RibbonBackground />
      <div className={styles.lights} aria-hidden="true">
        {LIGHTS.map((c, i) => (
          <span key={i} className={`${styles.light} ${c}`} />
        ))}
      </div>
      <div className={styles.vignette} aria-hidden="true" />

      <div className={styles.cardWrap}>
        <LoginForm />
      </div>

      <div className={styles.footer}>© 2026 AWS Distribution. All rights reserved.</div>
    </main>
  );
}
