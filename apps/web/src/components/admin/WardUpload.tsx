"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { validateWardCollection } from "@/lib/geojson";

export function WardUpload() {
  const t = useTranslations("admin");
  const [missing, setMissing] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const countMissing = async () => {
    const { count } = await getBrowserClient()
      .from("wards")
      .select("id", { count: "exact", head: true })
      .is("geom", null);
    return count ?? null;
  };
  const refresh = async () => setMissing(await countMissing());
  useEffect(() => {
    let alive = true;
    countMissing().then((c) => alive && setMissing(c));
    return () => {
      alive = false;
    };
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fc = JSON.parse(await file.text());
      const v = validateWardCollection(fc);
      if (!v.ok) {
        setMsg(v.errors.slice(0, 5).map((er) => `#${er.index}: ${er.reason}`).join("; "));
        return;
      }
      const { data, error } = await getBrowserClient().rpc("upsert_wards_geojson", { p_fc: fc, p_source: "manual" });
      if (error) setMsg(error.message);
      else setMsg(t("loaded", { count: data as number }));
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <section className="card space-y-2" aria-labelledby="wards-h">
      <h2 id="wards-h" className="text-lg font-bold">
        {t("wards")}
      </h2>
      <p className="text-sm text-muted">{t("wardsHint")}</p>
      {missing !== null && <p className="text-sm font-bold">{t("missing", { count: missing })}</p>}
      <label className="btn-secondary cursor-pointer">
        {t("upload")}
        <input
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          className="sr-only"
          onChange={onFile}
          disabled={busy}
          data-testid="ward-upload"
        />
      </label>
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </section>
  );
}
