"use client";

import { useEffect, useRef } from "react";
import styles from "./login.module.css";

type Ribbon = {
  y: number; amp: number; amp2: number; k: number; k2: number;
  speed: number; speed2: number; phase: number; thickness: number;
  c1: string; c2: string; c3: string; alpha: number;
};

/**
 * Full-bleed flowing silk ribbons in the brand colours. Drawn crisp, softened by a
 * heavy CSS blur on the canvas element for a luminous silk look. Bold + energetic,
 * but calm in motion. Static single frame under prefers-reduced-motion.
 */
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
