"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { changePassword, type ChangeState } from "./actions";
import BrandLogo from "../login/BrandLogo";
import styles from "./change-password.module.css";

const SYSTEM_NAME = "AWS Accounting Platform";

const LockIcon = () => (
  <svg className={styles.fieldIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="4" y="9" width="12" height="8" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" strokeLinecap="round" />
  </svg>
);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? <span className={styles.spinner} aria-label="Saving" /> : "Set new password"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, action] = useFormState<ChangeState, FormData>(changePassword, {});
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";

  return (
    <main className={styles.stage}>
      <div className={styles.vignette} />
      <div className={styles.cardWrap}>
        <form className={styles.card} action={action}>
          <Link href="/dashboard" className={styles.back}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>
          <div className={styles.brand}>
            <BrandLogo width={88} />
          </div>
          <div className={styles.systemName}>{SYSTEM_NAME}</div>
          <h1 className={styles.welcome}>Set a new password</h1>
          <p className={styles.welcomeSub}>
            Choose a new password (at least 8 characters) to continue.
          </p>

          {state.error && (
            <div role="alert" className={styles.error}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
              </svg>
              {state.error}
            </div>
          )}

          <div className={styles.field}>
            <input
              id="current"
              className={styles.input}
              type={type}
              name="current"
              placeholder=" "
              autoComplete="current-password"
              required
            />
            <label htmlFor="current" className={styles.label}>Current password</label>
            <LockIcon />
          </div>

          <div className={styles.field}>
            <input
              id="password"
              className={styles.input}
              type={type}
              name="password"
              placeholder=" "
              autoComplete="new-password"
              required
              minLength={8}
            />
            <label htmlFor="password" className={styles.label}>New password</label>
            <LockIcon />
          </div>

          <div className={styles.field}>
            <input
              id="confirm"
              className={styles.input}
              type={type}
              name="confirm"
              placeholder=" "
              autoComplete="new-password"
              required
              minLength={8}
            />
            <label htmlFor="confirm" className={styles.label}>Confirm new password</label>
            <LockIcon />
          </div>

          <label className={styles.reveal}>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show passwords
          </label>

          <SubmitButton />

          <p className={styles.hint}>You’ll only need to do this once.</p>
        </form>
      </div>
    </main>
  );
}
