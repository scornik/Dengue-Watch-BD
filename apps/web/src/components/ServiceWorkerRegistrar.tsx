"use client";

import { useEffect } from "react";
import { env } from "@/lib/env";

// Loaded on demand so supabase-js is not part of every page's initial JS.
const flushQueue = () => import("@/lib/queue/flush").then((m) => m.flushQueue());

/** Registers /sw.js and retries the offline report queue when back online. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      // The worker cannot read env vars; hand it what it needs for background uploads.
      caches
        .open("dw-config")
        .then((c) =>
          c.put(
            "/__config",
            new Response(JSON.stringify({ functionsUrl: `${env.supabaseUrl}/functions/v1`, anonKey: env.supabaseAnonKey })),
          ),
        )
        .catch(() => {});
    }
    const onOnline = () => void flushQueue();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "flush-queue") void flushQueue();
    };
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    // Flush anything left over from a previous visit.
    if (navigator.onLine) {
      void import("@/lib/queue/db")
        .then((m) => m.listQueue())
        .then((items) => (items.length ? flushQueue() : null))
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
