import { useTranslations } from "next-intl";
import type { SiteStatus } from "@/lib/report/types";

export const STATUS_COLORS: Record<SiteStatus, string> = {
  new: "#1d4ed8",
  verified: "#6d28d9",
  assigned: "#b45309",
  cleared: "#15803d",
  not_found: "#4b5563",
  rejected: "#9ca3af",
};

export function StatusBadge({ status }: { status: SiteStatus }) {
  const t = useTranslations("status");
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
      style={{ background: STATUS_COLORS[status] }}
    >
      {t(status)}
    </span>
  );
}
