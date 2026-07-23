"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./login.module.css";
import BrandLogo from "./BrandLogo";

type Status = "idle" | "loading" | "success";

// System / product name (working name — update when finalised).
const SYSTEM_NAME = "AWS Accounting Platform";

export default function LoginForm() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status !== "idle") return;
    if (!username.trim() || !password) {
      setError("Enter your username and password to continue.");
      return;
    }
    setError("");
    setStatus("loading");

    const res = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });

    if (!res || res.error) {
      setError("Incorrect username or password.");
      setStatus("idle");
      return;
    }

    setStatus("success");
    await new Promise((r) => setTimeout(r, 450));
    router.push("/dashboard");
    router.refresh();
  }

  const container = {
    hidden: { opacity: 0, y: reduce ? 0 : 20, scale: reduce ? 1 : 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: 0.15, duration: 0.5 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.form
      className={`${styles.card} ${error ? styles.shake : ""}`}
      onSubmit={onSubmit}
      variants={container}
      initial="hidden"
      animate="show"
      noValidate
    >
      <motion.div className={styles.brand} variants={item}>
        <BrandLogo />
      </motion.div>
      <motion.div className={styles.systemName} variants={item}>
        {SYSTEM_NAME}
      </motion.div>
      <motion.h2 className={styles.welcome} variants={item}>
        Welcome back
      </motion.h2>
      <motion.p className={styles.welcomeSub} variants={item}>
        Sign in to continue.
      </motion.p>

      {error && (
        <div className={styles.error} role="alert">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      <motion.div className={styles.field} variants={item}>
        <input
          id="username"
          className={styles.input}
          placeholder=" "
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={status !== "idle"}
        />
        <label htmlFor="username" className={styles.label}>
          Username
        </label>
        <svg className={styles.fieldIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="10" cy="6.5" r="3.2" />
          <path d="M4 16c0-3 2.7-4.8 6-4.8S16 13 16 16" strokeLinecap="round" />
        </svg>
      </motion.div>

      <motion.div className={styles.field} variants={item}>
        <input
          id="password"
          className={styles.input}
          type={show ? "text" : "password"}
          placeholder=" "
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={status !== "idle"}
        />
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <svg className={styles.fieldIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="4" y="9" width="12" height="8" rx="2" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" strokeLinecap="round" />
        </svg>
        <button
          type="button"
          className={styles.eye}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
              <circle cx="10" cy="10" r="2.4" />
              <path d="M3 3l14 14" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
              <circle cx="10" cy="10" r="2.4" />
            </svg>
          )}
        </button>
      </motion.div>

      <motion.button
        type="submit"
        className={styles.submit}
        variants={item}
        whileHover={reduce ? undefined : { scale: 1.01 }}
        whileTap={reduce ? undefined : { scale: 0.99 }}
        disabled={status !== "idle"}
      >
        {status === "idle" && <>Sign in</>}
        {status === "loading" && <span className={styles.spinner} aria-label="Signing in" />}
        {status === "success" && (
          <svg className={styles.checkmark} viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.6">
            <motion.path
              d="M4 10.5l3.6 3.6L16 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </svg>
        )}
      </motion.button>

      <motion.p className={styles.hint} variants={item}>
        Accounts are created by an administrator.
      </motion.p>
    </motion.form>
  );
}
