"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MESSAGE_MAX, SUPPORT_TOPICS, sendSupportMessage, type SupportTopic } from "@/lib/support";
import { formatNumber } from "@/lib/format";

type State = "idle" | "sending" | "sent" | "too_many" | "error" | "too_short";

export function ContactForm() {
  const t = useTranslations("contact");
  const locale = useLocale();
  const [topic, setTopic] = useState<SupportTopic>("question");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>("idle");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Honeypot: people never see this field; simple bots fill every field.
    if (String(f.get("website") || "")) return setState("sent");
    if (message.trim().length < 5) return setState("too_short");
    setState("sending");
    const result = await sendSupportMessage({
      topic,
      message: message.trim(),
      name: String(f.get("name") || ""),
      contact: String(f.get("contact") || ""),
      page: document.referrer ? new URL(document.referrer).pathname : undefined,
      locale,
    });
    setState(result);
    if (result === "sent") {
      setMessage("");
      e.currentTarget.reset();
    }
  };

  if (state === "sent") {
    return (
      <section className="card space-y-3 text-center" role="status" data-testid="contact-sent">
        <p className="font-display text-xl font-bold">{t("sent")}</p>
        <p className="text-muted">{t("sentReply")}</p>
        <button type="button" className="btn-secondary w-full" onClick={() => setState("idle")}>
          {t("another")}
        </button>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="contact-form-h">
      <h2 id="contact-form-h" className="text-lg font-bold">
        {t("formTitle")}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 space-y-3" data-testid="contact-form">
        <fieldset>
          <legend className="field-label">{t("topic")}</legend>
          <div className="flex flex-wrap gap-2">
            {SUPPORT_TOPICS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={topic === k}
                onClick={() => setTopic(k)}
                className={`min-h-11 rounded-full border-2 border-ink px-4 text-sm font-bold ${topic === k ? "bg-ink text-white" : "bg-white text-ink"}`}
              >
                {t(`topics.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="field-label">{t("message")}</span>
          <textarea
            name="message"
            required
            rows={5}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="input min-h-32"
            data-testid="contact-message"
          />
          <span className="block text-right text-xs text-muted">
            {t("count", {
              count: formatNumber(message.length, locale),
              max: formatNumber(MESSAGE_MAX, locale),
            })}
          </span>
        </label>
        <label className="block">
          <span className="field-label">{t("name")}</span>
          <input name="name" maxLength={80} autoComplete="name" className="input" />
        </label>
        <label className="block">
          <span className="field-label">{t("reply")}</span>
          <input name="contact" maxLength={120} autoComplete="email" className="input" data-testid="contact-reply" />
        </label>
        <label className="sr-only" aria-hidden>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <p className="text-sm text-muted">🔒 {t("privacy")}</p>
        {state === "too_many" || state === "error" || state === "too_short" ? (
          <p role="alert" className="text-sm font-bold text-blood-700">
            {t(state === "too_many" ? "tooMany" : state === "too_short" ? "tooShort" : "error")}
          </p>
        ) : null}
        <button className="btn-primary w-full" disabled={state === "sending"} data-testid="contact-send">
          {state === "sending" ? t("sending") : t("send")}
        </button>
      </form>
    </section>
  );
}
