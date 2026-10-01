import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type React from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppClip } from "../components/AppClip";
import { Captions } from "../components/Captions";
import { Backdrop, Kinetic, Rise } from "../components/motion";
import { Brand, Tag } from "../components/ui";
import bnManifest from "../generated/story.json";
import enManifest from "../generated/en/story.json";
import { Music } from "../NarratedVideo";
import { C, body, display } from "../theme";
import { OUTRO_FRAMES, TRANSITION_FRAMES, sceneFrames, type Manifest, type ManifestScene } from "../timeline";

export type StoryProps = { name: string; role: string; siteUrl: string; lang: "bn" | "en" };

const pick = (lang: "bn" | "en") => (lang === "en" ? enManifest : bnManifest) as Manifest;

/** Full-bleed talking head; without a lip-synced clip the line is set as type instead. */
const Shot: React.FC<{ s: ManifestScene; first: boolean; name: string; role: string; ai: boolean }> = ({ s, first, name, role, ai }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {s.id === "build" ? (
        <>
          <Backdrop color={C.sky} seed="build" />
          <div style={{ position: "absolute", top: 300, left: 260 }}>
            <AppClip clip="report" from="camera" to="end" sceneFrames={sceneFrames(s, fps)} width={560} />
          </div>
          {s.avatar ? (
            <div style={{ position: "absolute", top: 120, right: 60, width: 300, height: 300, borderRadius: "50%", overflow: "hidden", border: `8px solid ${C.white}` }}>
              <Video src={staticFile(s.avatar)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
            </div>
          ) : null}
        </>
      ) : s.avatar ? (
        <AbsoluteFill style={{ scale: String(interpolate(frame, [0, 10 * fps], [1.04, 1.1])) }}>
          <Video src={staticFile(s.avatar)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
        </AbsoluteFill>
      ) : (
        <>
          <Backdrop color={s.mood === "hopeful" ? C.neem : C.ink} seed={s.id} />
          <div style={{ position: "absolute", top: 380, left: 80, right: 80 }}>
            {/* English narration: the line is set big in Bangla; the English words run in the captions. */}
            <Kinetic text={s.lines?.length ? s.lines.map((l) => l.bn).join(" ") : s.words.map((w) => w.text).join(" ")} at={4} size={84} stagger={2} align="left" />
          </div>
        </>
      )}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,13,28,0.55) 0%, rgba(11,13,28,0) 22%, rgba(11,13,28,0) 55%, rgba(11,13,28,0.75) 100%)" }} />
      {s.id === "build" ? null : (
        <div style={{ position: "absolute", top: 130, left: 80, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <Brand />
          {ai ? (
            <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: "rgba(255,255,255,0.7)" }}>এআই ভয়েস · প্রতিষ্ঠাতার নিজের কথা</div>
          ) : null}
        </div>
      )}
      {first && name ? (
        <Rise at={10} style={{ position: "absolute", left: 80, top: 1080 }}>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 72, color: C.white }}>{name}</div>
          <div style={{ fontFamily: body, fontWeight: 700, fontSize: 40, color: C.marigold }}>{role}</div>
        </Rise>
      ) : null}
    </AbsoluteFill>
  );
};

const NotWritten: React.FC = () => (
  <AbsoluteFill>
    <Backdrop color={C.ink} seed="todo" />
    <div style={{ position: "absolute", top: 160, left: 80, right: 80, display: "flex", flexDirection: "column", gap: 34 }}>
      <Tag bg={C.marigold}>গল্পের অডিও এখনো তৈরি হয়নি</Tag>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 40, color: C.white, lineHeight: 1.5 }}>Run media/voice/narrate.py story.</div>
    </div>
  </AbsoluteFill>
);

export const storyFrames = (fps: number, lang: "bn" | "en" = "bn") => {
  const m = pick(lang);
  return m.scenes.length ? m.scenes.reduce((a, s) => a + sceneFrames(s, fps), 0) - TRANSITION_FRAMES * (m.scenes.length - 1) + OUTRO_FRAMES : 150;
};

export const StoryVideo: React.FC<StoryProps> = ({ name, role, siteUrl, lang }) => {
  const { fps } = useVideoConfig();
  const m = pick(lang);
  const en = lang === "en";
  if (!m.scenes.length) return <NotWritten />;
  const items: React.ReactNode[] = [];
  m.scenes.forEach((s, i) => {
    const last = i === m.scenes.length - 1;
    items.push(
      <TransitionSeries.Sequence key={s.id} name={s.id} durationInFrames={sceneFrames(s, fps) + (last ? OUTRO_FRAMES : 0)} premountFor={fps}>
        <Shot s={s} first={i === 0} name={name} role={role} ai={en} />
        {last ? (
          <>
            <Rise at={sceneFrames(s, fps) - 20} style={{ position: "absolute", left: 0, right: 0, top: 1150, display: "flex", justifyContent: "center" }}>
              <Tag size={60}>{siteUrl}</Tag>
            </Rise>
            <Sequence from={sceneFrames(s, fps) - 20} durationInFrames={45}>
              <Audio src={staticFile("sfx/ding.wav")} volume={0.3} />
            </Sequence>
          </>
        ) : null}
        <Captions words={s.words} layout="vertical" tone="light" />
        <Audio src={staticFile(s.audio)} />
      </TransitionSeries.Sequence>,
    );
    if (!last) items.push(<TransitionSeries.Transition key={s.id + "-t"} presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })} />);
  });
  return (
    <AbsoluteFill style={{ background: C.inkDeep }}>
      <TransitionSeries>{items}</TransitionSeries>
      <Music src="music/story.mp3" manifest={m} volume={0.26} />
    </AbsoluteFill>
  );
};
