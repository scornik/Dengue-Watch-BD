import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions } from "./components/Captions";
import { C } from "./theme";
import { OUTRO_FRAMES, TRANSITION_FRAMES, sceneFrames, sceneStarts, totalFrames, type Manifest, type ManifestScene } from "./timeline";

export type SceneDef = {
  id: string;
  Component: React.FC<{ s: ManifestScene }>;
  /** Caption box colour to contrast with the scene background. */
  tone: "light" | "dark";
  /** Caption placement for this scene, when the default would cover the content. */
  captionArea?: { left: number; right: number; bottom: number };
  /** Transition into the NEXT scene. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  out?: TransitionPresentation<any>;
};

/**
 * Lip-synced talking head, generated on a GPU by media/avatar/lipsync.sh from your own recorded
 * video and this scene's narration. Muted: the narration track already carries the voice.
 */
const AvatarBubble: React.FC<{ src: string; layout: "vertical" | "landscape" }> = ({ src, layout }) => {
  const frame = useCurrentFrame();
  const size = layout === "vertical" ? 300 : 260;
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        right: layout === "vertical" ? 70 : 60,
        top: layout === "vertical" ? 140 : 60,
        borderRadius: "50%",
        overflow: "hidden",
        border: `8px solid ${C.white}`,
        boxShadow: `0 8px 0 0 ${C.inkDeep}`,
        scale: String(interpolate(frame, [0, 12], [0.6, 1], { extrapolateRight: "clamp", easing: Easing.bezier(0.34, 1.56, 0.64, 1) })),
      }}
    >
      <Video src={staticFile(src)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

/**
 * Background music under the whole video. It ducks while anyone speaks (so every word stays clear)
 * and swells in the gaps, with a fade in and a longer fade out.
 */
export const Music: React.FC<{ src: string; manifest: Manifest; volume: number }> = ({ src, manifest, volume }) => {
  const { fps } = useVideoConfig();
  const starts = sceneStarts(manifest, fps);
  const total = totalFrames(manifest, fps);
  const speech: [number, number][] = [];
  manifest.scenes.forEach((s, i) => {
    const spans = s.lines?.length ? s.lines.map((l) => [l.startMs, l.endMs]) : s.words.map((w) => [w.startMs, w.endMs]);
    for (const [a, b] of spans) speech.push([starts[i] + (a / 1000) * fps, starts[i] + (b / 1000) * fps]);
  });
  const level = (f: number) => {
    let d = Infinity;
    for (const [a, b] of speech) d = Math.min(d, f < a ? a - f : f > b ? f - b : 0);
    const duck = interpolate(d, [0, 10], [0.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const fade = Math.min(
      interpolate(f, [0, 20], [0, 1], { extrapolateRight: "clamp" }),
      interpolate(f, [total - 60, total - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
    return volume * duck * fade;
  };
  return <Audio src={staticFile(src)} loop volume={level} />;
};

export const NarratedVideo: React.FC<{
  manifest: Manifest;
  scenes: SceneDef[];
  layout: "vertical" | "landscape";
  /** public/ path of a background track; omit for none. */
  music?: string;
  musicVolume?: number;
}> = ({ manifest, scenes, layout, music, musicVolume = 0.22 }) => {
  const { fps } = useVideoConfig();
  const byId = new Map(manifest.scenes.map((s) => [s.id, s]));
  const items: React.ReactNode[] = [];

  scenes.forEach((def, i) => {
    const s = byId.get(def.id);
    if (!s) throw new Error(`${manifest.video}: scene "${def.id}" missing from manifest; run media/voice/narrate.py ${manifest.video}`);
    const last = i === scenes.length - 1;
    items.push(
      <TransitionSeries.Sequence key={def.id} name={def.id} durationInFrames={sceneFrames(s, fps) + (last ? OUTRO_FRAMES : 0)} premountFor={fps}>
        <AbsoluteFill>
          <def.Component s={s} />
          {s.avatar ? <AvatarBubble src={s.avatar} layout={layout} /> : null}
          <Captions words={s.words} lines={s.lines} layout={layout} tone={def.tone} area={def.captionArea} />
          <Audio src={staticFile(s.audio)} />
        </AbsoluteFill>
      </TransitionSeries.Sequence>,
    );
    if (!last) {
      items.push(
        <TransitionSeries.Transition
          key={def.id + "-t"}
          presentation={def.out ?? fade()}
          timing={
            i % 2 === 0
              ? linearTiming({ durationInFrames: TRANSITION_FRAMES, easing: Easing.bezier(0.65, 0, 0.35, 1) })
              : springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_FRAMES })
          }
        />,
      );
    }
  });

  const starts = sceneStarts(manifest, fps);
  return (
    <AbsoluteFill style={{ background: C.inkDeep }}>
      <TransitionSeries>{items}</TransitionSeries>
      {music ? <Music src={music} manifest={manifest} volume={musicVolume} /> : null}
      {/* a whoosh on every scene change, alternating with a whip so it never sounds looped */}
      {starts.slice(1).map((f, i) => (
        <Sequence key={f} from={Math.max(0, f - 4)} durationInFrames={20}>
          <Audio src={staticFile(i % 2 ? "sfx/whip.wav" : "sfx/whoosh.wav")} volume={0.45} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
