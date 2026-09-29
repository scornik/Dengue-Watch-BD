"use client";

import type { AiLabel } from "@/lib/report/types";

export type ScreeningState = {
  status: "idle" | "loading" | "running" | "done" | "skipped";
  label: AiLabel;
  score: number | null;
  progress: number;
};

/** On-device screening (implemented in M3). Until then every report is "pending". */
export function useScreening(photo: Blob | null): ScreeningState {
  void photo;
  return { status: "skipped", label: "pending", score: null, progress: 0 };
}
