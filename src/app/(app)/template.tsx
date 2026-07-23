"use client";

import { motion, useReducedMotion } from "framer-motion";

// A template re-mounts on every navigation, so this gives each page a subtle
// enter transition. The sidebar (in layout) stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
