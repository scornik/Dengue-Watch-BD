import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming, springTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions } from "./components/Captions";
import { C } from "./theme";
import { OUTRO_FRAMES, TRANSITION_FRAMES, sceneFrames, type Manifest, type ManifestScene } from "./timeline";

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

export const NarratedVideo: React.FC<{ manifest: Manifest; scenes: SceneDef[]; layout: "vertical" | "landscape" }> = ({
  manifest,
  scenes,
  layout,
}) => {
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
          <Captions words={s.words} layout={layout} tone={def.tone} area={def.captionArea} />
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

  return (
    <AbsoluteFill style={{ background: C.inkDeep }}>
      <TransitionSeries>{items}</TransitionSeries>
    </AbsoluteFill>
  );
};
