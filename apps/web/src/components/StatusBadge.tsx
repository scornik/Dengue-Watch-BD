import { useTranslations } from "next-intl";
import type { SiteStatus } from "@/lib/report/types";
import { STATUS_COLORS } from "@/lib/map/colors";

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
