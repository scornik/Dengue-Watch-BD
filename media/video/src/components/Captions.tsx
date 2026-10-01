import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { useMemo } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, body, hardShadow } from "../theme";
import type { Word } from "../timeline";

type Props = {
  words: Word[];
  /** "vertical" keeps captions clear of the Reels/Shorts UI in the bottom fifth of the screen. */
  layout: "vertical" | "landscape";
  /** Captions on a light or dark scene. */
  tone?: "light" | "dark";
  /** Override where the caption box sits (px from the frame edges). */
  area?: { left: number; right: number; bottom: number };
};

/**
 * Word-by-word Bangla captions. The words and their timings come from forced alignment of the
 * exact script (media/voice/narrate.py), so the text never differs from what is spoken.
 */
export const Captions: React.FC<Props> = ({ words, layout, tone = "dark", area }) => {
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
    // Bangla words are long; ~1.1 s per page keeps it to one or two short lines.
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: layout === "vertical" ? 1100 : 1600 }).pages;
  }, [words, layout]);

  const page = [...pages].reverse().find((p) => p.startMs <= nowMs);
  if (!page) return null;
  const pageEnd = page.startMs + page.durationMs;
  if (nowMs > pageEnd + 400) return null;

  const pageFrame = Math.round((page.startMs / 1000) * fps);
  const vertical = layout === "vertical";

  return (
    <div
      style={{
        position: "absolute",
        left: area?.left ?? (vertical ? 70 : 240),
        right: area?.right ?? (vertical ? 70 : 240),
        bottom: area?.bottom ?? (vertical ? 270 : 70),
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
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
          fontSize: vertical ? 64 : 46,
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
    </div>
  );
};
