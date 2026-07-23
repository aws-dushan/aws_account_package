import styles from "./app.module.css";

/** Generic page skeleton shown by loading.tsx while a server page streams. */
export default function SkeletonPage({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <div className={styles.pageHead}>
        <div style={{ width: "100%" }}>
          <span className={styles.skel} style={{ width: 120, height: 12, marginBottom: 12 }} />
          <span className={styles.skel} style={{ width: 280, height: 26, marginBottom: 10 }} />
          <span className={styles.skel} style={{ width: 360, height: 14, maxWidth: "70%" }} />
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardPad} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <span key={i} className={styles.skel} style={{ height: 16, width: `${92 - i * 7}%` }} />
          ))}
        </div>
      </div>
    </>
  );
}
