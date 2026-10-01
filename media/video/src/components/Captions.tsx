import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, body, hardShadow } from "../theme";
import type { Line, Word } from "../timeline";

type Props = {
  words: Word[];
  /** "vertical" keeps captions clear of the Reels/Shorts UI in the bottom fifth of the screen. */
  layout: "vertical" | "landscape";
  /** Captions on a light or dark scene. */
  tone?: "light" | "dark";
  /** Override where the caption box sits (px from the frame edges). */
  area?: { left: number; right: number; bottom: number };
  /** English narration: the Bangla translation of the current line, shown above the English words. */
  lines?: Line[];
};

/**
 * Word-by-word Bangla captions. The words and their timings come from forced alignment of the
 * exact script (media/voice/narrate.py), so the text never differs from what is spoken.
 */
export const Captions: React.FC<Props> = ({ words, layout, tone = "dark", area, lines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const pages = useMemo(() => {
    const captions: Caption[] = words.map((w, i) => ({
      text: (i === 0 ? "" : " ") + w.text,
      startMs: w.startMs,
      endMs: w.endMs,
      timestampMs: (w.startMs + w.endMs) / 2,
      confidence: w.confidence,
    }));
    // Bangla words are long; ~1.1 s per page keeps it to one or two short lines. English pages are
    // shorter in width, so they can hold a little more.
    const span = lines ? (layout === "vertical" ? 1300 : 1900) : layout === "vertical" ? 1100 : 1600;
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: span }).pages;
  }, [words, layout, lines]);

  const found = [...pages].reverse().find((p) => p.startMs <= nowMs);
  const page = found && nowMs <= found.startMs + found.durationMs + 400 ? found : null;
  const line = lines?.find((l) => l.startMs - 120 <= nowMs && nowMs < l.endMs + 350);
  if (!page && !line) return null;

  const pageFrame = page ? Math.round((page.startMs / 1000) * fps) : 0;
  const lineFrame = line ? Math.round(((line.startMs - 120) / 1000) * fps) : 0;
  const vertical = layout === "vertical";

  return (
    <div
      style={{
        position: "absolute",
        left: area?.left ?? (vertical ? 70 : 240),
        right: area?.right ?? (vertical ? 70 : 240),
        bottom: area?.bottom ?? (vertical ? (lines ? 220 : 270) : 70),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        pointerEvents: "none",
      }}
    >
      {line ? (
        <div
          key={line.startMs}
          style={{
            padding: vertical ? "10px 24px 14px" : "8px 20px 10px",
            borderRadius: 16,
            background: C.marigold,
            color: C.ink,
            fontFamily: body,
            fontWeight: 700,
            fontSize: vertical ? 38 : 32,
            lineHeight: 1.35,
            textAlign: "center",
            boxShadow: hardShadow(5),
            opacity: interpolate(frame, [lineFrame, lineFrame + 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            translate: `0px ${interpolate(frame, [lineFrame, lineFrame + 8], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`,
          }}
        >
          {line.bn}
        </div>
      ) : null}
      {page ? (
      <div
        key={page.startMs}
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: vertical ? "6px 4px" : "4px 2px",
          padding: vertical ? "18px 26px 22px" : "12px 22px 16px",
          borderRadius: 22,
          background: tone === "dark" ? "rgba(11,13,28,0.86)" : C.white,
          boxShadow: hardShadow(6, tone === "dark" ? "rgba(0,0,0,0.35)" : C.inkDeep),
          fontFamily: body,
          fontWeight: 700,
          fontSize: vertical ? (lines ? 54 : 64) : lines ? 40 : 46,
          lineHeight: 1.35,
          color: tone === "dark" ? C.white : C.ink,
          scale: interpolate(frame, [pageFrame, pageFrame + 6], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [pageFrame, pageFrame + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {page.tokens.map((t) => {
          const active = t.fromMs <= nowMs && nowMs < t.toMs;
          const spoken = t.fromMs <= nowMs;
          return (
            <span
              key={t.fromMs}
              style={{
                padding: "0 10px",
                borderRadius: 12,
                background: active ? C.marigold : "transparent",
                color: active ? C.ink : spoken ? undefined : tone === "dark" ? "rgba(255,255,255,0.55)" : C.muted,
                whiteSpace: "pre",
              }}
            >
              {t.text.trim()}
            </span>
          );
        })}
      </div>
      ) : null}
    </div>
  );
};
