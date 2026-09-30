"use client";

import { useTranslations } from "next-intl";
import { useQueueCount } from "@/lib/queue/useQueue";
import { Link } from "@/i18n/navigation";

export function QueueBadge() {
  const t = useTranslations("home");
  const count = useQueueCount();
  if (!count) return null;
  return (
    <Link href="/mine" className="mt-3 block rounded-xl bg-marigold-50 p-2 text-center text-sm font-bold text-ink">
      ⏳ {t("queued", { count })}
    </Link>
  );
}
