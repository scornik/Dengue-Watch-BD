import { noise2D } from "@remotion/noise";
import type React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, display } from "../theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** Springs a child in (scale + lift) at `at` frames. */
export const Pop: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; from?: number }> = ({
  at,
  children,
  style,
  from = 0.4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 160, mass: 0.7 } });
  return (
    <div
      style={{
        scale: String(interpolate(s, [0, 1], [from, 1])),
        opacity: interpolate(frame, [at, at + 4], [0, 1], clamp),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Rises in from below with a short blur, the house style for supporting text. */
export const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; distance?: number }> = ({
  at,
  children,
  style,
  distance = 60,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        translate: `0px ${interpolate(frame, [at, at + 18], [distance, 0], { ...clamp, easing: easeOut })}px`,
        opacity: interpolate(frame, [at, at + 10], [0, 1], clamp),
        filter: `blur(${interpolate(frame, [at, at + 12], [12, 0], clamp)}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Big display headline; words snap in one after another. */
export const Kinetic: React.FC<{
  text: string;
  at?: number;
  size: number;
  color?: string;
  accent?: { word: string; color: string };
  stagger?: number;
  align?: "left" | "center";
  style?: React.CSSProperties;
}> = ({ text, at = 0, size, color = C.white, accent, stagger = 3, align = "center", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.12,
        color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: `0 ${size * 0.26}px`,
        textAlign: align,
        ...style,
      }}
    >
      {text.split(" ").map((w, i) => {
        const start = at + i * stagger;
        const s = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 200 } });
        const isAccent = accent && w.includes(accent.word);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: isAccent ? accent.color : undefined,
              translate: `0px ${interpolate(s, [0, 1], [size * 0.6, 0])}px`,
              rotate: `${interpolate(s, [0, 1], [6, 0])}deg`,
              opacity: interpolate(frame, [start, start + 3], [0, 1], clamp),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Flat brand-colour field with two slow drifting shapes, so even static scenes breathe. */
export const Backdrop: React.FC<{ color: string; shape?: string; seed?: string }> = ({ color, shape, seed = "a" }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 140;
  const big = Math.max(width, height);
  const blob = (k: string, r: number, bx: number, by: number) => ({
    position: "absolute" as const,
    width: r,
    height: r,
    borderRadius: "50%",
    left: bx * width + noise2D(seed + k + "x", t, 0) * 120 - r / 2,
    top: by * height + noise2D(seed + k + "y", 0, t) * 120 - r / 2,
    background: shape ?? "rgba(255,255,255,0.06)",
  });
  return (
    <AbsoluteFill style={{ background: color, overflow: "hidden" }}>
      <div style={blob("1", big * 0.75, 0.92, 0.12)} />
      <div style={blob("2", big * 0.45, 0.05, 0.9)} />
    </AbsoluteFill>
  );
};

/** Animated count-up, with Bangla digits. */
export const CountUp: React.FC<{ to: number; at: number; dur?: number; format?: (n: number) => string; style?: React.CSSProperties }> = ({
  to,
  at,
  dur = 30,
  format = (n) => String(n),
  style,
}) => {
  const frame = useCurrentFrame();
  const v = Math.round(interpolate(frame, [at, at + dur], [0, to], { ...clamp, easing: easeOut }));
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{format(v)}</span>;
};

export const progress = (frame: number, a: number, b: number, easing = easeOut) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing });
