import type React from "react";
import { Freeze, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import clips from "../generated/app-clips.json";
import { Phone } from "./Phone";

type Clips = Record<string, { src: string; marks: Record<string, number>; durationMs: number }>;
const CLIPS = clips as Clips;

/**
 * A segment of a real screen recording of the app (media/capture/record.mjs), between two named
 * marks, inside a phone frame. The segment is sped up or slowed down (within limits that still look
 * natural) to fill the scene, then holds its last frame.
 */
export const AppClip: React.FC<{
  clip: keyof typeof clips;
  from: string;
  to: string;
  /** Length of the scene this plays in, in frames. */
  sceneFrames: number;
  width: number;
  style?: React.CSSProperties;
}> = ({ clip, from, to, sceneFrames, width, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = CLIPS[clip];
  const fromMs = c.marks[from] ?? 0;
  const toMs = to === "end" ? c.durationMs : c.marks[to];
  const segFrames = ((toMs - fromMs) / 1000) * fps;
  const rate = Math.min(1.8, Math.max(0.75, segFrames / Math.max(1, sceneFrames - 10)));
  const lastFrame = Math.max(0, Math.floor(segFrames / rate) - 1);
  return (
    <Phone width={width} style={style}>
      <Freeze frame={lastFrame} active={frame > lastFrame}>
        <OffthreadVideo
          src={staticFile(c.src)}
          trimBefore={Math.round((fromMs / 1000) * fps)}
          playbackRate={rate}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Freeze>
    </Phone>
  );
};
