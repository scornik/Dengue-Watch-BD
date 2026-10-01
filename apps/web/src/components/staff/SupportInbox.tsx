"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { SupportMessage } from "@/lib/support";

type Tab = "new" | "read" | "resolved" | "all";
const PAGE = 30;
const COLUMNS = "id, topic, name, contact, message, page, locale, status, staff_note, handled_at, created_at";

/** Contact-form messages for the support team (moderators and superadmins; RLS enforces it). */
export function SupportInbox() {
  const t = useTranslations("inbox");
  const tc = useTranslations("contact");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("new");
  const [rows, setRows] = useState<SupportMessage[] | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const [version, setVersion] = useState(0);

  const fetchRows = useCallback(async (): Promise<SupportMessage[]> => {
    let q = getBrowserClient().from("support_messages").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q;
    return (data as SupportMessage[]) ?? [];
  }, [tab, limit]);

  useEffect(() => {
    let alive = true;
    fetchRows().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [fetchRows, version]);

  const update = async (id: string, patch: Partial<Pick<SupportMessage, "status" | "staff_note">>) => {
    await getBrowserClient().from("support_messages").update(patch).eq("id", id);
    setVersion((v) => v + 1);
  };

  const tabs: [Tab, string][] = [
    ["new", t("tabNew")],
    ["read", t("tabRead")],
    ["resolved", t("tabResolved")],
    ["all", t("tabAll")],
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-4 gap-1 rounded-full bg-sky-200 p-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setLimit(PAGE);
            }}
            className={`font-display min-h-11 rounded-full text-sm ${tab === k ? "bg-ink text-white" : "text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-sky-200" />
      ) : rows.length === 0 ? (
        <p className="card text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3" data-testid="inbox-list">
          {rows.map((m) => (
            <li key={m.id} className="card space-y-2" data-testid="inbox-item">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-ink px-3 py-1 font-bold text-white">{tc(`topics.${m.topic}`)}</span>
                <span className="text-muted">{formatDateTime(m.created_at, locale)}</span>
                {m.status !== "new" && (
                  <span className="rounded-full bg-neem-50 px-3 py-1 text-neem-700">
                    {t(m.status === "read" ? "tabRead" : "tabResolved")}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{m.message}</p>
              <p className="text-sm">
                <span className="font-bold">{m.name ?? t("noName")}</span>
                {" · "}
                {m.contact ? (
                  <a
                    className="text-brand-700 underline"
                    href={
                      m.contact.includes("@")
                        ? `mailto:${m.contact}?subject=${encodeURIComponent("DengueWatch BD")}`
                        : `tel:${m.contact.replace(/[^\d+]/g, "")}`
                    }
                  >
                    {m.contact}
                  </a>
                ) : (
                  <span className="text-muted">{t("noContact")}</span>
                )}
              </p>
              {m.page && <p className="text-xs text-muted">{t("from", { page: m.page })}</p>}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const note = String(new FormData(e.currentTarget).get("note") || "").trim();
                  void update(m.id, { staff_note: note || null });
                }}
              >
                <input
                  name="note"
                  defaultValue={m.staff_note ?? ""}
                  maxLength={1000}
                  aria-label={t("note")}
                  placeholder={t("note")}
                  className="input flex-1"
                />
                <button className="btn-ghost text-sm">{t("saveNote")}</button>
              </form>
              <div className="grid grid-cols-2 gap-2">
                {m.status === "new" && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void update(m.id, { status: "read" })}
                    data-testid="inbox-read"
                  >
                    {t("markRead")}
                  </button>
                )}
                {m.status !== "resolved" ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void update(m.id, { status: "resolved" })}
                    data-testid="inbox-resolve"
                  >
                    {t("resolve")}
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={() => void update(m.id, { status: "new" })}>
                    {t("reopen")}
                  </button>
                )}
              </div>
              {m.handled_at && <p className="text-xs text-muted">{t("handled", { time: formatDateTime(m.handled_at, locale) })}</p>}
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === limit && (
        <button type="button" className="btn-ghost w-full" onClick={() => setLimit((n) => n + PAGE)}>
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
