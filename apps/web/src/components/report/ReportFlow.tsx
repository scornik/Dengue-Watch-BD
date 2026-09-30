"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { preparePhoto, type Prepared } from "@/lib/image/compress";
import { assessQuality, type Quality } from "@/lib/screening/quality";
import { useScreening } from "@/lib/screening/useScreening";
import { LARVAE, SITE_TYPES, type Larvae, type ReportMeta, type SiteType } from "@/lib/report/types";
import { getDeviceId } from "@/lib/device";
import { enqueue } from "@/lib/queue/db";
import { flushQueue } from "@/lib/queue/flush";
import { loadMaplibre } from "@/lib/map/maplibre";
import type { PickedLocation } from "./LocationPicker";
import { SITE_ICONS } from "./siteIcons";
import { DoneScreen, type DoneState } from "./DoneScreen";

// MapLibre (~300 KB gz) is only fetched for step 2 (prefetched once a photo is
// chosen), so the report route's initial JS stays small.
const LocationPicker = dynamic(() => import("./LocationPicker"), {
  ssr: false,
  loading: () => <div className="h-[46vh] min-h-64 animate-pulse rounded-2xl bg-sky-200" />,
});

const TOTAL = 4;

export function ReportFlow() {
  const t = useTranslations("report");
  const ts = useTranslations("siteType");
  const tl = useTranslations("larvae");
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmIrrelevant, setConfirmIrrelevant] = useState(false);
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [siteType, setSiteType] = useState<SiteType | null>(null);
  const [larvae, setLarvae] = useState<Larvae>("unsure");
  const [selfCleaned, setSelfCleaned] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);
  const [siteId, setSiteId] = useState<string | undefined>();
  const screening = useScreening(photo?.blob ?? null);

  // Move focus to the step heading for screen readers.
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  // Warm up: once a photo is chosen, fetch the map bundle for step 2.
  const hasPhoto = !!photo;
  useEffect(() => {
    if (hasPhoto) void loadMaplibre().catch(() => {});
  }, [hasPhoto]);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessing(true);
    setError(null);
    setConfirmIrrelevant(false);
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setQuality(assessQuality(prepared.sample));
    } catch {
      setError(t("errorPhoto"));
    } finally {
      setProcessing(false);
    }
  };

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!photo) return setError(t("errorPhoto"));
      if (screening.label === "not_relevant" && !confirmIrrelevant) {
        setConfirmIrrelevant(true);
        return;
      }
    }
    if (step === 2 && !loc) return setError(t("errorLocation"));
    if (step === 3 && !siteType) return setError(t("siteTypeLabel"));
    setStep((s) => Math.min(TOTAL, s + 1));
  };

  const back = () => {
    setError(null);
    if (step === 1) router.push("/");
    else setStep((s) => s - 1);
  };

  const submit = async () => {
    if (!photo || !loc || !siteType) return;
    setSubmitting(true);
    const meta: ReportMeta = {
      id: crypto.randomUUID(),
      lat: Number(loc.lat.toFixed(6)),
      lng: Number(loc.lng.toFixed(6)),
      accuracy_m: loc.accuracy,
      site_type: siteType,
      larvae_seen: larvae,
      self_cleaned: selfCleaned,
      note: note.trim() || null,
      ai_label: screening.label,
      ai_score: screening.score,
      device_id: getDeviceId(),
      client_created_at: new Date().toISOString(),
    };
    // Always persist first, so nothing is lost if the network drops mid-upload.
    const token = navigator.onLine
      ? await import("@/lib/supabase/client").then((m) => m.ensureCitizenSession()).catch(() => null)
      : null;
    await enqueue({ id: meta.id, meta, photo: photo.blob, token });
    const result = navigator.onLine ? await flushQueue() : null;
    const outcome = result?.last?.kind;
    if (result?.last?.kind === "sent") {
      setSiteId(result.last.siteId ?? undefined);
      import("@/lib/game/client").then((m) => m.bumpXp()).catch(() => {});
    }
    // Rendered in place (no navigation), so it also works fully offline.
    setDone(outcome === "sent" ? "sent" : outcome === "rate_limited" ? "limited" : outcome === "otp_required" ? "otp" : "queued");
    window.scrollTo(0, 0);
  };

  if (done && siteType) return <DoneScreen state={done} type={siteType} cleaned={selfCleaned} siteId={siteId} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted">{t("stepOf", { step, total: TOTAL })}</p>
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span key={i} className={`h-2 w-8 rounded-full ${i < step ? "bg-brand-700" : "bg-sky-200"}`} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="space-y-3">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
            {t("photoTitle")}
          </h1>
          <p className="text-muted">{t("photoHint")}</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onFile}
            data-testid="photo-camera"
            aria-label={t("takePhoto")}
            tabIndex={-1}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onFile}
            data-testid="photo-input"
            aria-label={t("choosePhoto")}
            tabIndex={-1}
          />
          {photo ? (
            <figure className="overflow-hidden rounded-2xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="mx-auto max-h-[45vh] object-contain" />
            </figure>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-4 border-dashed border-brand-600 bg-brand-50 text-lg font-bold text-brand-800"
            >
              <span aria-hidden="true" className="text-5xl">
                📷
              </span>
              {t("takePhoto")}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {photo && (
              <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
                {t("retake")}
              </button>
            )}
            <button
              type="button"
              className={`btn-ghost ${photo ? "" : "col-span-2"}`}
              onClick={() => galleryInput.current?.click()}
            >
              🖼️ {t("choosePhoto")}
            </button>
          </div>
          <div aria-live="polite" className="space-y-2 text-sm">
            {processing && <p>{t("checking")}</p>}
            {quality?.dark && <p className="rounded-lg bg-marigold-50 p-2 text-ink">{t("tooDark")}</p>}
            {quality && !quality.dark && quality.blurry && (
              <p className="rounded-lg bg-marigold-50 p-2 text-ink">{t("tooBlurry")}</p>
            )}
            {photo && screening.status === "loading" && (
              <p className="text-muted">{t("modelLoading", { percent: screening.progress })}</p>
            )}
            {photo && screening.status === "running" && <p className="text-muted">{t("checking")}</p>}
            {photo && screening.status === "skipped" && <p className="text-muted">{t("modelSkipped")}</p>}
            {photo && screening.status === "done" && screening.label === "likely" && (
              <p className="rounded-lg bg-brand-50 p-2 text-brand-800">✓ {t("looksGood")}</p>
            )}
            {photo && screening.status === "done" && screening.label === "unclear" && (
              <p className="text-muted">{t("looksUnclear")}</p>
            )}
          </div>
          {confirmIrrelevant && (
            <div role="alertdialog" aria-labelledby="nr-title" className="card border-2 border-marigold">
              <p id="nr-title" className="font-bold">
                {t("notRelevantTitle")}
              </p>
              <p className="text-sm text-muted">{t("notRelevantBody")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
                  {t("retake")}
                </button>
                <button type="button" className="btn-primary" onClick={() => setStep(2)} data-testid="send-anyway">
                  {t("sendAnyway")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
            {t("locationTitle")}
          </h1>
          <LocationPicker value={loc} onChange={setLoc} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
            {t("detailsTitle")}
          </h1>
          <fieldset>
            <legend className="field-label">{t("siteTypeLabel")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {SITE_TYPES.map((st) => (
                <label key={st} className="chip justify-start gap-2 rounded-xl py-2">
                  <input
                    type="radio"
                    name="site_type"
                    value={st}
                    checked={siteType === st}
                    onChange={() => setSiteType(st)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className="text-xl">
                    {SITE_ICONS[st]}
                  </span>
                  {ts(st)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="field-label">{t("larvaeLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {LARVAE.map((l) => (
                <label key={l} className="chip">
                  <input
                    type="radio"
                    name="larvae"
                    value={l}
                    checked={larvae === l}
                    onChange={() => setLarvae(l)}
                    className="sr-only"
                  />
                  {tl(l)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-12 items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-sky-200">
            <input
              type="checkbox"
              checked={selfCleaned}
              onChange={(e) => setSelfCleaned(e.target.checked)}
              className="h-6 w-6 accent-brand-700"
            />
            <span className="font-bold">{t("selfCleaned")}</span>
          </label>
          <label className="block">
            <span className="field-label">{t("noteLabel")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t("notePlaceholder")}
              className="input"
            />
            <span className="text-xs text-muted">{t("noteHint")}</span>
          </label>
        </section>
      )}

      {step === 4 && photo && loc && siteType && (
        <section className="space-y-3">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
            {t("confirmTitle")}
          </h1>
          <div className="card flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-24 w-24 rounded-xl object-cover" />
            <dl className="text-sm">
              <dt className="sr-only">{t("siteTypeLabel")}</dt>
              <dd className="text-base font-bold">
                {SITE_ICONS[siteType]} {ts(siteType)}
              </dd>
              <dt className="sr-only">{t("larvaeLabel")}</dt>
              <dd>🦟 {tl(larvae)}</dd>
              {selfCleaned && <dd>✓ {t("selfCleaned")}</dd>}
              <dd className="text-muted">
                📍 {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
              </dd>
              {note && <dd className="text-muted">“{note}”</dd>}
            </dl>
          </div>
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">🔒 {t("privacy")}</p>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-blood-50 p-2 font-bold text-blood-700">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 z-20 grid grid-cols-3 gap-2 bg-sky/95 py-2">
        <button type="button" className="btn-secondary col-span-1" onClick={back}>
          {t("back")}
        </button>
        {step < TOTAL ? (
          <button
            type="button"
            className="btn-primary col-span-2"
            onClick={next}
            disabled={processing || (step === 1 && !photo)}
            data-testid="next"
          >
            {t("next")}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary col-span-2"
            onClick={submit}
            disabled={submitting}
            data-testid="submit"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        )}
      </div>
    </div>
  );
}
