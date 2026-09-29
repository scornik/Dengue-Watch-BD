"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pushSupported, subscribePush } from "@/lib/push/subscribe";

export function PushOptIn() {
  const t = useTranslations("done");
  const locale = useLocale();
  const supported = useSyncExternalStore(
    () => () => {},
    pushSupported,
    () => false,
  );
  const [state, setState] = useState<"idle" | "on" | "busy">("idle");

  useEffect(() => {
    if (pushSupported() && Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then((s) => s && setState("on"))
        .catch(() => {});
    }
  }, []);

  if (!supported) return null;
  if (state === "on") {
    return (
      <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
        🔔 {t("notifyOn")}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        setState((await subscribePush(locale)) ? "on" : "idle");
      }}
    >
      🔔 {t("notify")}
    </button>
  );
}
