"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";

export default function StaffLogin() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getBrowserClient();
    // Drop an anonymous citizen session first so staff get their own user.
    const { data } = await sb.auth.getSession();
    if (data.session?.user.is_anonymous) await sb.auth.signOut();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/\/login$/, "")}` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await getBrowserClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/staff");
  };

  return (
    <div className="card mx-auto max-w-md">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      {!sent ? (
        <form onSubmit={send} className="mt-4 space-y-3">
          <label className="field-label" htmlFor="email">
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={busy}>
            {t("send")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <p role="status" className="rounded-lg bg-brand-50 p-3 text-brand-800">
            {t("sent")}
          </p>
          <label className="field-label" htmlFor="code">
            {t("code")}
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            className="input tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>
            {t("verify")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
