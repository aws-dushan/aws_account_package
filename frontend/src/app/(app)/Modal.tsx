"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./app.module.css";

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => setMounted(true), []);

  // Keep the modal rendered through its exit animation, then unmount.
  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 190);
      return () => clearTimeout(t);
    }
  }, [open, visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [visible, onClose]);

  if (!visible || !mounted) return null;

  // Portal to <body>: the page-transition wrapper applies a transform, which would
  // otherwise trap this fixed overlay inside the page box (truncating the modal).
  return createPortal(
    <div className={`${styles.modalOverlay} ${closing ? styles.modalClosing : ""}`} onClick={onClose}>
      <div
        className={`${styles.modal} ${wide ? styles.modalWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <h3 className={styles.modalTitle}>{title}</h3>
            {subtitle && <div className={styles.modalSub}>{subtitle}</div>}
          </div>
          <button type="button" className={styles.modalX} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
