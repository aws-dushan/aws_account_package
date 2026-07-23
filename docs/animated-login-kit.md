# Animated Login Kit

A self-contained, reusable **"bold brand motion"** login screen: flowing silk ribbons +
soft floating lights behind a centered frosted-glass card, with a self-drawing brand logo
and polished form micro-interactions (floating labels, show/hide password, gradient button
→ spinner → drawn checkmark).

Drop it into any **Next.js (App Router)** project by copying five files, or adapt the vanilla
version for any stack. Everything is inline — no CSS framework, no UI library, one dependency.

- **Committed visual world:** vivid dark ground, light card (does not follow app light/dark theme).
- **Accessible:** full `prefers-reduced-motion` support, keyboard focus, ARIA labels.
- **Self-contained:** pure CSS + a small canvas script; only `framer-motion` for the form.

---

## Dependencies

| Requirement | Notes |
|---|---|
| Next.js (App Router) | Client components (`"use client"`). React 18+. |
| `framer-motion` | `npm i framer-motion` (form entrance + button states only). |
| — | No Tailwind / UI kit / webfonts. Uses the system font stack. |

For a **non-React** project, see [Framework-agnostic version](#framework-agnostic-version).

---

## File map

```
app/login/
  page.tsx              # composition: background + lights + card + footer
  LoginForm.tsx         # the form (fields, validation, submit states)
  BrandLogo.tsx         # SVG logo that strokes itself in
  RibbonBackground.tsx  # <canvas> silk-ribbon animation
  login.module.css      # all styles + keyframes
```

## Quick start (Next.js)

1. `npm i framer-motion`
2. Copy the five files below into `app/login/`.
3. Ensure a route exists for the post-login redirect (default `/dashboard`) — or edit
   `router.push("/dashboard")` in `LoginForm.tsx`.
4. Replace the demo submit in `LoginForm.tsx` with your real auth call.
5. Swap the logo — edit `BrandLogo.tsx`, or drop `public/logo.png` and render `<img>` (see
   [Customization](#customization)).

---

## Source

### `app/login/page.tsx`
```tsx
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
```

### `app/login/LoginForm.tsx`
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./login.module.css";
import BrandLogo from "./BrandLogo";

type Status = "idle" | "loading" | "success";

// TODO: replace with the final system/product name once decided.
const SYSTEM_NAME = "System Name";

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
    // TODO: replace with your real auth call (e.g. Auth.js signIn).
    await new Promise((r) => setTimeout(r, 950));
    setStatus("success");
    await new Promise((r) => setTimeout(r, 550));
    router.push("/dashboard");
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
```

### `app/login/BrandLogo.tsx`
```tsx
import styles from "./login.module.css";

/**
 * Brand logo — an orange outlined "D" enclosing "AWS" (orange A / navy W / orange S)
 * over navy "DISTRIBUTION". The D strokes itself in, then the letters fade up.
 * For a pixel-perfect mark, drop the official file at /public/logo.png and render
 * <img src="/logo.png" alt="AWS Distribution" width={128} /> instead.
 */
export default function BrandLogo() {
  return (
    <svg
      className={styles.logo}
      viewBox="34 13 202 174"
      role="img"
      aria-label="AWS Distribution"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className={styles.dPath}
        d="M50,30 H150 A70,70 0 0 1 150,170 H50 Z"
        fill="none"
        stroke="#ee7623"
        strokeWidth="20"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
      />
      <g className={styles.logoText} textAnchor="middle">
        <text x="135" y="103" fontFamily="system-ui, 'Segoe UI', sans-serif" fontWeight="800" fontSize="47" letterSpacing="1.5">
          <tspan fill="#ee7623">A</tspan>
          <tspan fill="#2e2c7b">W</tspan>
          <tspan fill="#ee7623">S</tspan>
        </text>
        <text x="135" y="132" fontFamily="system-ui, 'Segoe UI', sans-serif" fontWeight="700" fontSize="14.5" letterSpacing="1.7" fill="#2e2c7b">
          DISTRIBUTION
        </text>
      </g>
    </svg>
  );
}
```

### `app/login/RibbonBackground.tsx`
```tsx
"use client";

import { useEffect, useRef } from "react";
import styles from "./login.module.css";

type Ribbon = {
  y: number; amp: number; amp2: number; k: number; k2: number;
  speed: number; speed2: number; phase: number; thickness: number;
  c1: string; c2: string; c3: string; alpha: number;
};

export default function RibbonBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ribbons: Ribbon[] = [];

    function build() {
      const defs: Omit<Ribbon, "y" | "thickness" | "amp" | "amp2">[] = [
        { k: 0.0016, k2: 0.0009, speed: 0.16, speed2: 0.10, phase: 0.0, c1: "#ee7623", c2: "#f59042", c3: "#ffb163", alpha: 0.55 },
        { k: 0.0013, k2: 0.0011, speed: -0.13, speed2: 0.08, phase: 1.2, c1: "#f0842f", c2: "#e0532a", c3: "#f59042", alpha: 0.5 },
        { k: 0.0018, k2: 0.0008, speed: 0.11, speed2: -0.09, phase: 2.4, c1: "#e87ba4", c2: "#c95b8a", c3: "#ee7623", alpha: 0.42 },
        { k: 0.0012, k2: 0.0012, speed: -0.10, speed2: 0.12, phase: 3.5, c1: "#8f8bf0", c2: "#6b67e0", c3: "#b9aef0", alpha: 0.4 },
        { k: 0.0015, k2: 0.001, speed: 0.14, speed2: -0.07, phase: 4.7, c1: "#514ec9", c2: "#3a37a0", c3: "#6b67e0", alpha: 0.38 },
      ];
      ribbons = defs.map((d, i) => ({
        ...d,
        y: h * (0.1 + i * 0.19),
        amp: h * (0.09 + (i % 3) * 0.025),
        amp2: h * 0.04,
        thickness: h * (0.15 + (i % 2) * 0.05),
      }));
    }

    function resize() {
      const c = canvas!;
      w = c.clientWidth; h = c.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h);
      const step = 26;
      for (const r of ribbons) {
        const top = (x: number) =>
          r.y + r.amp * Math.sin(x * r.k + t * r.speed + r.phase) +
          r.amp2 * Math.sin(x * r.k2 - t * r.speed2 + r.phase);
        const g = ctx!.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, r.c1); g.addColorStop(0.5, r.c2); g.addColorStop(1, r.c3);
        ctx!.globalAlpha = r.alpha;
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.moveTo(-60, top(-60));
        for (let x = -60; x <= w + 60; x += step) ctx!.lineTo(x, top(x));
        for (let x = w + 60; x >= -60; x -= step) ctx!.lineTo(x, top(x) + r.thickness);
        ctx!.closePath();
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function frame(now: number) {
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    }

    resize();
    if (reduce) draw(2.5);
    else raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduce) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={styles.ribbons} aria-hidden="true" />;
}
```

### `app/login/login.module.css`
```css
/* Bold brand motion — flowing silk ribbons + centered frosted card.
   Committed visual world: vivid dark ground, light card. */
.stage{
  position:relative; min-height:100vh; min-height:100dvh;
  display:grid; place-items:center; padding:28px; overflow:hidden; isolation:isolate;
  background:
    radial-gradient(1200px 820px at 28% 18%, #271839 0%, transparent 60%),
    radial-gradient(1050px 720px at 78% 84%, #17122f 0%, transparent 55%),
    linear-gradient(160deg,#150f24 0%,#0c0a1a 58%,#080611 100%);
}

/* flowing ribbons (softened by heavy blur into silk) */
.ribbons{position:absolute; inset:0; width:100%; height:100%; z-index:0;
  filter:blur(42px) saturate(1.35) brightness(1.06); will-change:contents}

/* soft floating light bokeh */
.lights{position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden}
.light{position:absolute; border-radius:50%; filter:blur(10px); opacity:0; will-change:transform, opacity}
.l1{width:70px;height:70px;left:12%;top:66%;background:radial-gradient(circle,rgba(255,200,150,.9),transparent 70%);animation:drift 15s .0s ease-in-out infinite}
.l2{width:44px;height:44px;left:80%;top:20%;background:radial-gradient(circle,rgba(255,175,110,.85),transparent 70%);animation:drift 18s 2s ease-in-out infinite}
.l3{width:96px;height:96px;left:24%;top:80%;background:radial-gradient(circle,rgba(185,174,240,.7),transparent 70%);animation:drift 21s 4s ease-in-out infinite}
.l4{width:36px;height:36px;left:60%;top:12%;background:radial-gradient(circle,rgba(255,255,255,.8),transparent 70%);animation:drift 13s 1s ease-in-out infinite}
.l5{width:58px;height:58px;left:88%;top:72%;background:radial-gradient(circle,rgba(255,210,160,.8),transparent 70%);animation:drift 17s 3.5s ease-in-out infinite}
.l6{width:50px;height:50px;left:38%;top:38%;background:radial-gradient(circle,rgba(150,140,235,.65),transparent 70%);animation:drift 19s 6s ease-in-out infinite}
.l7{width:30px;height:30px;left:70%;top:54%;background:radial-gradient(circle,rgba(255,255,255,.75),transparent 70%);animation:drift 14s 5s ease-in-out infinite}
.l8{width:40px;height:40px;left:8%;top:32%;background:radial-gradient(circle,rgba(255,190,130,.8),transparent 70%);animation:drift 20s 3s ease-in-out infinite}

/* grain + focus */
.vignette{position:absolute; inset:0; z-index:1; pointer-events:none;
  background:
    radial-gradient(60% 55% at 50% 46%, rgba(255,255,255,.05), transparent 60%),
    radial-gradient(130% 120% at 50% 42%, transparent 40%, rgba(4,3,12,.72) 100%)}

/* ============ card ============ */
.cardWrap{position:relative; z-index:2; width:min(430px,94vw)}
.cardWrap::before{content:""; position:absolute; inset:-1.5px; border-radius:28px; z-index:-1;
  background:linear-gradient(140deg, rgba(255,255,255,.7), rgba(255,255,255,.05) 40%, rgba(238,118,35,.35));
  opacity:.9}
.card{
  position:relative; overflow:hidden; border-radius:27px;
  background:rgba(255,255,255,.9);
  backdrop-filter:blur(26px) saturate(1.5); -webkit-backdrop-filter:blur(26px) saturate(1.5);
  box-shadow:0 40px 90px -36px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.2);
  padding:38px 34px 28px; color:#191927;
}
.card::after{content:""; position:absolute; top:0; left:-72%; width:56%; height:100%; pointer-events:none;
  background:linear-gradient(100deg, transparent, rgba(255,255,255,.5), transparent);
  transform:skewX(-16deg); animation:sweep 7s 1.4s ease-in-out infinite}

/* logo + system-name placeholder */
.brand{display:flex; justify-content:center; margin-bottom:10px}
.logo{width:128px; height:auto; display:block; margin:0 auto}
.systemName{text-align:center; font-size:11px; font-weight:600; letter-spacing:3px;
  text-transform:uppercase; color:#9a9aab; margin:2px 0 10px}
.dPath{stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1.6s .25s cubic-bezier(.6,0,.2,1) forwards}
.logoText{opacity:0; animation:fadein .7s 1.25s ease forwards}

.welcome{font-size:23px; font-weight:750; letter-spacing:-.01em; margin:0; text-align:center; color:#161625}
.welcomeSub{font-size:13.5px; color:#63637a; margin:7px 0 26px; text-align:center}

/* fields */
.field{position:relative; margin-bottom:14px}
.input{width:100%; height:52px; padding:0 44px; background:#fbfbfe; color:#191927;
  border:1.5px solid #e6e6ef; border-radius:13px; font-size:15px; outline:none;
  transition:border-color .18s, box-shadow .18s, background .18s}
.input::placeholder{color:transparent}
.input:focus{border-color:#ee7623; background:#fff; box-shadow:0 0 0 4px rgba(238,118,35,.14)}
.label{position:absolute; left:44px; top:50%; transform:translateY(-50%); color:#9797a8;
  font-size:15px; pointer-events:none; transition:all .16s ease; padding:0 5px}
.input:focus + .label, .input:not(:placeholder-shown) + .label{
  top:0; left:38px; transform:translateY(-50%) scale(.82); color:#c05e10; background:#fff; font-weight:700}
.fieldIcon{position:absolute; left:15px; top:50%; transform:translateY(-50%); color:#a2a2b2; width:18px; height:18px; pointer-events:none}
.input:focus ~ .fieldIcon{color:#ee7623}
.eye{position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer;
  color:#a2a2b2; padding:6px; border-radius:8px; display:grid; place-items:center}
.eye:hover{color:#191927; background:#f0f0f5} .eye svg{width:18px;height:18px}

.submit{width:100%; height:53px; margin-top:10px; border:none; border-radius:13px; cursor:pointer;
  background:linear-gradient(100deg,#ee7623 0%,#f2903f 45%,#f0842f 100%);
  color:#fff; font-size:15.5px; font-weight:750; letter-spacing:.2px;
  display:flex; align-items:center; justify-content:center; gap:9px; position:relative; overflow:hidden;
  box-shadow:0 14px 28px -10px rgba(238,118,35,.6); transition:transform .12s ease, box-shadow .2s, filter .2s}
.submit:hover{filter:brightness(1.05); box-shadow:0 18px 34px -10px rgba(238,118,35,.7)}
.submit:active{transform:translateY(1px) scale(.995)} .submit:disabled{cursor:default; opacity:.94}
.spinner{width:19px;height:19px;border-radius:50%; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff; animation:spin .7s linear infinite}
.checkmark{width:20px;height:20px}

.error{color:#a62828; background:#fbe0e0; border:1px solid #f0b4b4; border-radius:11px; padding:9px 12px;
  font-size:12.5px; font-weight:600; margin-bottom:14px; display:flex; align-items:center; gap:8px}
.shake{animation:shake .38s cubic-bezier(.36,.07,.19,.97)}
.hint{margin-top:20px; text-align:center; font-size:11.5px; color:#9797a8; line-height:1.5} .hint b{color:#5a5a70}

/* footer under card */
.footer{position:absolute; bottom:22px; z-index:2; font-size:12px; letter-spacing:.5px;
  color:rgba(255,255,255,.5); animation:rise .8s 1.5s cubic-bezier(.22,1,.36,1) both}

/* ============ keyframes ============ */
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes fadein{to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sweep{0%{left:-72%}22%{left:130%}100%{left:130%}}
@keyframes rise{from{opacity:0; transform:translateY(14px)}to{opacity:1; transform:none}}
@keyframes drift{
  0%{opacity:0; transform:translateY(30px) scale(.8)}
  15%{opacity:.65}
  55%{opacity:.5; transform:translateY(-40px) scale(1.15)}
  85%{opacity:.35}
  100%{opacity:0; transform:translateY(-90px) scale(.9)}
}
@keyframes shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-5px)}40%,60%{transform:translateX(5px)}}

@media (prefers-reduced-motion:reduce){
  .light{animation:none !important; opacity:.28}
  .card::after,.footer{animation:none !important}
  .dPath{stroke-dashoffset:0; animation:none !important}
  .logoText{opacity:1; animation:none !important}
}
```

---

## Customization

| Want to change | Where |
|---|---|
| **Brand accent (orange)** | Search-replace `#ee7623` / `#f2903f` / `#f0842f` in the CSS + logo. |
| **Ground colour** | `.stage` background gradient. |
| **Logo** | `BrandLogo.tsx` — edit the SVG, or drop `public/logo.png` and render `<img src="/logo.png" width={128} />` (loses the self-draw effect). |
| **Ribbon colours / speed / count** | `RibbonBackground.tsx` → the `defs` array (`c1/c2/c3`, `speed`, `alpha`) and `build()` (`y`, `amp`, `thickness`). |
| **Floating lights** | `.l1`–`.l8` in the CSS (position `left/top`, size, colour, `drift` timing). Add/remove and mirror the count in `page.tsx`'s `LIGHTS`. |
| **Silk softness** | `.ribbons { filter: blur(42px) … }` — more blur = softer. |
| **System / product name** | `SYSTEM_NAME` constant at the top of `LoginForm.tsx` (shown as an uppercase label under the logo). Placeholder = `"System Name"`. |
| **Copy** | Headings in `LoginForm.tsx`; footer in `page.tsx`. |
| **Post-login route** | `router.push("/dashboard")` in `LoginForm.tsx`. |
| **Real auth** | Replace the `setTimeout` block in `onSubmit` with your sign-in call; set `setError(...)` on failure. |

---

## Framework-agnostic version

For non-React projects, the design is a single HTML file (same CSS with plain class names,
plus a vanilla `<canvas>` script for the ribbons and small handlers for show/hide + submit).
The full standalone file lives alongside this project as `login-preview.html`. To port it:

1. Copy the `<style>` block verbatim (drop the CSS-module wrapper — class names are identical).
2. Copy the markup: `.stage > canvas.ribbons + .lights + .vignette + .cardWrap>.card + .footer`.
3. Copy the vanilla script: the ribbon `draw()`/`build()`/`resize()` loop (identical maths to
   `RibbonBackground.tsx`), plus `eye` toggle and `form` submit → spinner → checkmark.

---

## Accessibility & notes

- **Reduced motion:** ribbons render one static frame; lights, sweep, footer, and logo-draw are
  disabled; the form appears without stagger.
- **Focus & labels:** every control is keyboard-reachable with a visible focus ring; the password
  toggle and error region carry ARIA labels.
- **Committed theme:** the login intentionally ignores the app's light/dark setting — vivid dark
  ground, light card — so contrast is guaranteed. The rest of your app can remain theme-aware.
- **Performance:** the canvas caps DPR at 2, pauses when the tab is hidden, and the "silk" look
  comes from a cheap CSS blur rather than per-frame blurring.
```
