"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { env } from "@/lib/env";
import type { AiLabel } from "@/lib/report/types";
import { deviceCanScreen } from "./prompts";

export type ScreeningState = {
  status: "idle" | "loading" | "running" | "done" | "skipped";
  label: AiLabel;
  score: number | null;
  progress: number;
};

/** If the model isn't ready this long after a photo is chosen, the report goes out as "pending". */
export const LOAD_BUDGET_MS = 20_000;

// ---------------------------------------------------------------------------
// Module-level model store: one worker per page session.
// ---------------------------------------------------------------------------
type ModelState = { phase: "off" | "loading" | "ready" | "failed"; progress: number };
let model: ModelState = { phase: "off", progress: 0 };
let worker: Worker | null = null;
const listeners = new Set<() => void>();
const pending = new Map<number, (r: { label: AiLabel; score: number } | null) => void>();
let nextId = 1;
const files = new Map<string, number>();

function set(next: Partial<ModelState>) {
  model = { ...model, ...next };
  listeners.forEach((l) => l());
}

/** Start downloading the model (idempotent). Called after the first screen renders. */
export function warmUpScreening(): void {
  if (worker || typeof window === "undefined" || !env.clipModelId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!deviceCanScreen(navigator as any)) {
    set({ phase: "failed" });
    return;
  }
  try {
    worker = new Worker(new URL("./clip.worker.ts", import.meta.url), { type: "module" });
  } catch {
    set({ phase: "failed" });
    return;
  }
  set({ phase: "loading", progress: 0 });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.type === "progress") {
      files.set(m.file ?? "", m.progress);
      const avg = [...files.values()].reduce((a, b) => a + b, 0) / Math.max(1, files.size);
      set({ progress: Math.round(avg) });
    } else if (m.type === "ready") set({ phase: "ready", progress: 100 });
    else if (m.type === "result") {
      pending.get(m.id)?.({ label: m.label, score: m.score });
      pending.delete(m.id);
    } else if (m.type === "error") {
      if (m.id !== undefined) {
        pending.get(m.id)?.(null);
        pending.delete(m.id);
      } else set({ phase: "failed" });
    }
  };
  worker.onerror = () => set({ phase: "failed" });
  worker.postMessage({ type: "load", model: env.clipModelId });
}

function classify(image: Blob): Promise<{ label: AiLabel; score: number } | null> {
  if (!worker || model.phase !== "ready") return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ type: "classify", id, image });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve(null);
      }
    }, 15_000);
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => model;
const serverSnapshot = (): ModelState => ({ phase: "off", progress: 0 });

// ---------------------------------------------------------------------------
// Hook: screen the current photo. Never blocks submission.
// ---------------------------------------------------------------------------
export function useScreening(photo: Blob | null): ScreeningState {
  const m = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [result, setResult] = useState<{ photo: Blob; label: AiLabel; score: number | null; timedOut: boolean } | null>(
    null,
  );

  // Start the download once the report screen has rendered.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => warmUpScreening());
    else setTimeout(warmUpScreening, 500);
  }, []);

  // Budget: if the model is still loading 20 s after the photo was chosen, give up for this photo.
  useEffect(() => {
    if (!photo) return;
    const timer = setTimeout(() => {
      setResult((r) => (r?.photo === photo ? r : { photo, label: "pending", score: null, timedOut: true }));
    }, LOAD_BUDGET_MS);
    return () => clearTimeout(timer);
  }, [photo]);

  useEffect(() => {
    if (!photo || m.phase !== "ready") return;
    let alive = true;
    classify(photo).then((r) => {
      if (!alive) return;
      setResult((prev) =>
        prev?.photo === photo && !prev.timedOut
          ? prev
          : { photo, label: r?.label ?? "pending", score: r?.score ?? null, timedOut: false },
      );
    });
    return () => {
      alive = false;
    };
  }, [photo, m.phase]);

  if (!photo) return { status: "idle", label: "pending", score: null, progress: m.progress };
  const current = result?.photo === photo ? result : null;
  if (current && !current.timedOut) {
    return { status: current.label === "pending" ? "skipped" : "done", label: current.label, score: current.score, progress: 100 };
  }
  if (m.phase === "failed" || m.phase === "off" || current?.timedOut) {
    return { status: "skipped", label: "pending", score: null, progress: m.progress };
  }
  if (m.phase === "loading") return { status: "loading", label: "pending", score: null, progress: m.progress };
  return { status: "running", label: "pending", score: null, progress: 100 };
}
