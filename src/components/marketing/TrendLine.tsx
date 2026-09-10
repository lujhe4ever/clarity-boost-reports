export function TrendLine({ variant = "primary" }: { variant?: "primary" | "success" }) {
  return (
    <svg viewBox="0 0 240 72" className="h-16 w-full" role="img" aria-label="Tendência crescente">
      <defs>
        <linearGradient id={`trend-${variant}`} x1="0" y1="0" x2="1" y2="0">
          <stop
            offset="0"
            stopColor={variant === "success" ? "var(--success)" : "var(--primary)"}
          />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path className="trend-grid" d="M0 58H240M0 36H240M0 14H240" />
      <path
        className="trend-line"
        d="M4 58 C30 55 42 47 62 49 S94 38 112 40 S143 24 164 30 S194 18 212 21 S228 10 236 8"
        fill="none"
        stroke={`url(#trend-${variant})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
