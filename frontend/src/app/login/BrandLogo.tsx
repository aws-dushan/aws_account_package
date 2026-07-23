import styles from "./login.module.css";

/**
 * AWS Distribution logo — recreated in the corporate colours: an orange outlined
 * "D" enclosing "AWS" (orange A / navy W / orange S) over navy "DISTRIBUTION".
 * The D strokes itself in on load, then the letters fade up.
 *
 * For a pixel-perfect mark, save the official file at /public/logo.png and replace
 * this component with <img src="/logo.png" alt="AWS Distribution" width={200} />.
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
      {/* orange outlined D (draws itself) */}
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
        <text
          x="135"
          y="103"
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          fontWeight="800"
          fontSize="47"
          letterSpacing="1.5"
        >
          <tspan fill="#ee7623">A</tspan>
          <tspan fill="#2e2c7b">W</tspan>
          <tspan fill="#ee7623">S</tspan>
        </text>
        <text
          x="135"
          y="132"
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          fontWeight="700"
          fontSize="14.5"
          letterSpacing="1.7"
          fill="#2e2c7b"
        >
          DISTRIBUTION
        </text>
      </g>
    </svg>
  );
}
