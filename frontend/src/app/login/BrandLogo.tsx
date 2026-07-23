import styles from "./login.module.css";

/**
 * AWS Distribution logo — orange outlined "D" enclosing "AWS" (orange A / W / orange S)
 * over "DISTRIBUTION".
 *
 * tone:    "onLight" (default) for the white login card · "onDark" for the navy sidebar.
 * animate: draw-on the D + fade the letters (login only). Off = static (sidebar).
 */
export default function BrandLogo({
  tone = "onLight",
  animate = true,
  width,
}: {
  tone?: "onLight" | "onDark";
  animate?: boolean;
  width?: number;
}) {
  const w = tone === "onDark" ? "#ffffff" : "#2e2c7b"; // the "W"
  const dist = tone === "onDark" ? "#c9c6f0" : "#2e2c7b"; // "DISTRIBUTION"
  const dStroke = tone === "onDark" ? "#f2903f" : "#ee7623";

  return (
    <svg
      className={styles.logo}
      style={width ? { width } : undefined}
      viewBox="34 13 202 174"
      role="img"
      aria-label="AWS Distribution"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className={animate ? styles.dPath : undefined}
        d="M50,30 H150 A70,70 0 0 1 150,170 H50 Z"
        fill="none"
        stroke={dStroke}
        strokeWidth="20"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
      />
      <g className={animate ? styles.logoText : undefined} textAnchor="middle">
        <text
          x="135"
          y="103"
          fontFamily="var(--font-jakarta), system-ui, 'Segoe UI', sans-serif"
          fontWeight="800"
          fontSize="47"
          letterSpacing="1.5"
        >
          <tspan fill="#ee7623">A</tspan>
          <tspan fill={w}>W</tspan>
          <tspan fill="#ee7623">S</tspan>
        </text>
        <text
          x="135"
          y="132"
          fontFamily="var(--font-jakarta), system-ui, 'Segoe UI', sans-serif"
          fontWeight="700"
          fontSize="14.5"
          letterSpacing="1.7"
          fill={dist}
        >
          DISTRIBUTION
        </text>
      </g>
    </svg>
  );
}
