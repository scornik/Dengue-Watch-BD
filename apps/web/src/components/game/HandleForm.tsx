"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setHandle } from "@/lib/game/client";
import { validHandle } from "@/lib/game/rules";

export function HandleForm({ initial, onSaved }: { initial?: string | null; onSaved: (handle: string) => void }) {
  const t = useTranslations("me");
  const [value, setValue] = useState(initial ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validHandle(value)) return setMsg(t("handleInvalid"));
    setBusy(true);
    const r = await setHandle(value);
    setBusy(false);
    if (r === "ok") {
      setMsg(t("saved"));
      onSaved(value.trim());
    } else setMsg(r === "taken" ? t("handleTaken") : t("handleInvalid"));
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="field-label" htmlFor="handle">
        {t("handle")}
      </label>
      <div className="flex gap-2">
        <input
          id="handle"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={24}
          autoComplete="nickname"
          placeholder="MoshaShikari"
          data-testid="handle-input"
        />
        <button className="btn-primary shrink-0" disabled={busy} data-testid="handle-save">
          {t("save")}
        </button>
      </div>
      <p className="text-xs text-muted">{t("handleHint")}</p>
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </form>
  );
}
