/** Progress bar filled with the Aedes leg-band pattern (the app's signature). */
export function StripeBar({ value, label, tone = "light" }: { value: number; label: string; tone?: "light" | "dark" }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-4 w-full overflow-hidden rounded-full ${tone === "dark" ? "bg-white/15" : "bg-sky-200"}`}
    >
      <div className="aedes-band h-full rounded-full ring-2 ring-inset ring-ink" style={{ width: `${Math.max(pct, pct ? 6 : 0)}%` }} />
    </div>
  );
}
