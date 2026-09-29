import { useTranslations } from "next-intl";
import { RISK_COLORS, type RiskLevel } from "@/lib/map/colors";

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  const t = useTranslations("risk");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{
        background: level ? `${RISK_COLORS[level]}33` : "#e5e7eb",
        color: "#111827",
        border: `1px solid ${level ? RISK_COLORS[level] : "#9ca3af"}`,
      }}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: level ? RISK_COLORS[level] : "#9ca3af" }} />
      {level ? t(level) : t("none")}
    </span>
  );
}
