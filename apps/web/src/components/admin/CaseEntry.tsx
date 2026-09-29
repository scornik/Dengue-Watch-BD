"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { CASE_AREAS } from "@/lib/areas";

export function CaseEntry({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      date: String(f.get("date")),
      area: String(f.get("area")),
      admissions: Number(f.get("admissions")),
      deaths: Number(f.get("deaths") || 0),
      source_url: String(f.get("source_url") || "") || null,
      entered_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getBrowserClient().from("case_counts").upsert(row, { onConflict: "date,area" });
    setMsg(error ? error.message : tc("save") + " ✓");
  };

  return (
    <section className="card" aria-labelledby="cases-h">
      <h2 id="cases-h" className="text-lg font-bold">
        {t("cases")}
      </h2>
      <p className="text-sm text-muted">{t("casesHint")}</p>
      <form onSubmit={onSubmit} className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-1">
          <span className="field-label">{t("date")}</span>
          <input name="date" type="date" required className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="col-span-1">
          <span className="field-label">{t("area")}</span>
          <select name="area" className="input" required>
            {CASE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">{t("admissions")}</span>
          <input name="admissions" type="number" min={0} required className="input" inputMode="numeric" />
        </label>
        <label>
          <span className="field-label">{t("deaths")}</span>
          <input name="deaths" type="number" min={0} className="input" inputMode="numeric" defaultValue={0} />
        </label>
        <label className="col-span-2">
          <span className="field-label">{t("sourceUrl")}</span>
          <input name="source_url" type="url" className="input" placeholder="https://" />
        </label>
        <button className="btn-primary col-span-2">{t("save")}</button>
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
    </section>
  );
}
