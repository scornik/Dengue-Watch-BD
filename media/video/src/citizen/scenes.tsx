// Citizen tutorial, 1080×1920. The middle scenes play real screen recordings of the app
// (media/capture/record.mjs); titles and call-outs land on the frame where the narrator says the word.
import { Audio } from "@remotion/media";
import { noise2D } from "@remotion/noise";
import type React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppClip } from "../components/AppClip";
import { AcTray, Bucket, FlowerTub, Mosquito, WATER } from "../components/Icons";
import { Backdrop, Kinetic, Pop, Rise, progress } from "../components/motion";
import { Brand, Tag } from "../components/ui";
import { C, body, display, hardShadow } from "../theme";
import { sceneFrames, wordFrame, type ManifestScene } from "../timeline";

type SP = { s: ManifestScene };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* Hook: a mosquito drifts over a Dhaka rooftop at night. */
export const Hook: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const born = wordFrame(s, "জন্মায়", fps, 30);
  const fly = progress(frame, 0, born + 60, Easing.bezier(0.33, 0, 0.2, 1));
  const mx = interpolate(fly, [0, 1], [-200, 610]) + noise2D("mx", frame / 40, 0) * 30;
  const my = interpolate(fly, [0, 1], [760, 900]) + noise2D("my", 0, frame / 30) * 40;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="hook" />
      {Array.from({ length: 26 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: (i * 397) % 1080,
            top: 80 + ((i * 211) % 560),
            width: 6,
            height: 6,
            borderRadius: 3,
            background: C.white,
            opacity: 0.25 + 0.35 * Math.abs(Math.sin(frame / 20 + i)),
          }}
        />
      ))}
      <div style={{ position: "absolute", top: 150, width: "100%", display: "flex", justifyContent: "center" }}>
        <Rise at={2}>
          <Brand />
        </Rise>
      </div>
      <div style={{ position: "absolute", top: 300, left: 80, right: 80 }}>
        <Kinetic text="ডেঙ্গুর মশা জন্মায়" at={2} size={116} accent={{ word: "মশা", color: C.blood }} />
        <Kinetic text="আমাদের বাড়ির আশেপাশেই" at={wordFrame(s, "আমাদের", fps, 30) - 4} size={96} style={{ marginTop: 14 }} />
        <Rise at={wordFrame(s, "চলুন", fps, 150)} style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
          <Tag bg={C.marigold} size={50}>
            চলুন, সবাই মিলে খুঁজে ধ্বংস করি
          </Tag>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1100, height: 300 }}>
        <div style={{ position: "absolute", left: 60, right: 60, top: 120, height: 26, background: C.ink700, borderRadius: 8 }} />
        <div style={{ position: "absolute", left: 60, right: 60, top: 146, height: 400, background: "#141834" }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ position: "absolute", left: 110 + i * 180, top: 200, width: 90, height: 70, background: i === 2 ? C.marigold : "#232850", borderRadius: 6 }} />
        ))}
        <Pop at={wordFrame(s, "বাড়ির", fps, 40)} style={{ position: "absolute", left: 150, top: -40 }}>
          <Bucket size={170} />
        </Pop>
        <Pop at={wordFrame(s, "আশেপাশেই", fps, 50)} style={{ position: "absolute", left: 440, top: -45 }}>
          <FlowerTub size={175} />
        </Pop>
        <Pop at={wordFrame(s, "পানিতে", fps, 70)} style={{ position: "absolute", left: 720, top: -30 }}>
          <AcTray size={160} />
        </Pop>
      </div>
      <div style={{ position: "absolute", left: mx, top: my, rotate: `${noise2D("mr", frame / 25, 1) * 10}deg` }}>
        <Mosquito size={190} wing={Math.abs(Math.sin(frame * 1.6))} color="#e8ebf7" />
      </div>
    </AbsoluteFill>
  );
};

type Callout = { word: string; text: string; color?: string };

/** A tutorial step: title on top, the real app in the middle, call-outs under the phone. */
const Step: React.FC<{
  s: ManifestScene;
  bg: string;
  dark?: boolean;
  badge: string;
  title: string;
  titleWord?: string;
  clip: "report" | "hunt";
  from: string;
  to: string;
  callouts?: Callout[];
  demo?: boolean;
  top?: React.ReactNode;
}> = ({ s, bg, dark = false, badge, title, titleWord, clip, from, to, callouts = [], demo, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Backdrop color={bg} shape={dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.22)"} seed={s.id} />
      <div style={{ position: "absolute", top: 100, left: 80, right: 80, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 18 }}>
        <Rise at={0}>
          <Tag bg={dark ? C.white : C.ink} color={dark ? C.ink : C.white} size={36}>
            {badge}
          </Tag>
        </Rise>
        <Kinetic text={title} at={titleWord ? wordFrame(s, titleWord, fps, 4) - 4 : 4} size={84} color={dark ? C.white : C.ink} align="left" />
        {top}
      </div>
      <div
        style={{
          position: "absolute",
          top: 370,
          left: 310,
          translate: `0px ${interpolate(spring({ frame, fps, config: { damping: 18 } }), [0, 1], [120, 0])}px`,
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      >
        <AppClip clip={clip} from={from} to={to} sceneFrames={sceneFrames(s, fps)} width={460} />
        {demo ? (
          <div style={{ position: "absolute", top: 70, right: -50, rotate: "6deg" }}>
            <Tag bg={C.marigold} size={26}>
              ডেমো তথ্য
            </Tag>
          </div>
        ) : null}
      </div>
      <div style={{ position: "absolute", top: 1336, left: 40, right: 40, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
        {callouts.map((c) => (
          <Pop key={c.text} at={wordFrame(s, c.word, fps, 20)}>
            <Tag bg={c.color ?? (dark ? C.marigold : C.white)} color={C.ink} size={30}>
              {c.text}
            </Tag>
          </Pop>
        ))}
      </div>
      <div>
        {callouts.map((c) => (
          <Sequence key={c.text} from={wordFrame(s, c.word, fps, 20)} durationInFrames={15}>
            <Audio src={staticFile("sfx/mouse-click.wav")} volume={0.3} />
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Open: React.FC<SP & { siteUrl: string }> = ({ s, siteUrl }) => {
  const { fps } = useVideoConfig();
  return (
    <Step
      s={s}
      bg={C.sky}
      badge="শুরু"
      title="ফোনের ব্রাউজারে খুলুন"
      clip="report"
      from="home"
      to="tapReport"
      top={
        <Pop at={wordFrame(s, "ডেঙ্গুওয়াচ", fps, 20)}>
          <div style={{ padding: "10px 24px", borderRadius: 18, background: C.white, border: `4px solid ${C.ink}`, fontFamily: display, fontWeight: 800, fontSize: 42, color: C.ink, boxShadow: hardShadow(6) }}>{siteUrl}</div>
        </Pop>
      }
      callouts={[
        { word: "অ্যাপ", text: "অ্যাপ নামাতে হবে না" },
        { word: "নিবন্ধনও", text: "নিবন্ধন লাগে না", color: C.neem50 },
      ]}
    />
  );
};

export const Photo: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.marigold}
    badge="রিপোর্ট · ধাপ ১ / ৩"
    title="জমে থাকা পানির ছবি তুলুন"
    clip="report"
    from="tapReport"
    to="location"
    callouts={[
      { word: "লাল", text: "লাল বোতাম চাপুন", color: C.blood50 },
      { word: "যাচাই", text: "ফোনেই ছবি যাচাই", color: C.neem50 },
    ]}
  />
);

export const Location: React.FC<SP> = ({ s }) => (
  <Step s={s} bg={C.sky} badge="রিপোর্ট · ধাপ ২ / ৩" title="পিনটি ঠিক জায়গায় বসান" clip="report" from="location" to="details" callouts={[{ word: "মানচিত্র", text: "মানচিত্র সরিয়ে ঠিক করুন" }]} />
);

export const Details: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.ink}
    dark
    badge="রিপোর্ট · ধাপ ৩ / ৩"
    title="ধরন বেছে নিয়ে পাঠান"
    clip="report"
    from="details"
    to="end"
    callouts={[
      { word: "পাত্র", text: "পাত্রের ধরন" },
      { word: "লার্ভা", text: "লার্ভা দেখেছেন?" },
      { word: "ঝাপসা", text: "মুখ ও নম্বর ঝাপসা", color: C.neem50 },
    ]}
  />
);

export const Hunt: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.neem}
    dark
    badge="শিকারি · ধাপ ১ / ৪"
    title="কাছের কোন জায়গা পরিষ্কার দরকার"
    clip="hunt"
    from="home"
    to="open"
    demo
    callouts={[
      { word: "শিকার", text: "নিচে “শিকার” ট্যাব" },
      { word: "কাছের", text: "কাছেরগুলো আগে" },
    ]}
  />
);

export const Claim: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.sky}
    badge="শিকারি · ধাপ ২ / ৪"
    title="“এটা আমি ধ্বংস করব”"
    clip="hunt"
    from="open"
    to="after"
    demo
    callouts={[
      { word: "চাপুন", text: "সবুজ বোতাম চাপুন", color: C.neem50 },
      { word: "তিন", text: "৩ ঘণ্টা আপনার জন্য রাখা" },
    ]}
  />
);

export const Clean: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.marigold}
    badge="শিকারি · ধাপ ৩ / ৪"
    title="ধ্বংস করে পরের ছবি তুলুন"
    clip="hunt"
    from="after"
    to="board"
    demo
    callouts={[
      { word: "ফেলে", text: "পানি ফেলুন" },
      { word: "ঘষে", text: "ভেতরটা ঘষুন" },
      { word: "ঢেকে", text: "ঢাকুন" },
      { word: "দাঁড়িয়েই", text: "৫০ মিটারের মধ্যে ছবি", color: C.neem50 },
    ]}
  />
);

export const Points: React.FC<SP> = ({ s }) => (
  <Step
    s={s}
    bg={C.ink}
    dark
    badge="শিকারি · ধাপ ৪ / ৪"
    title="পয়েন্ট জিতুন, লিডারবোর্ডে উঠুন"
    clip="hunt"
    from="board"
    to="end"
    demo
    callouts={[
      { word: "পয়েন্ট", text: "+২০ XP প্রতি জায়গা" },
      { word: "ভুয়া", text: "ভুয়া ছবি বাতিল হয়", color: C.blood50 },
    ]}
  />
);

/* Call to action: the bucket tips, the water pours out, the URL lands. */
export const Cta: React.FC<SP & { siteUrl: string }> = ({ s, siteUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const todayAt = wordFrame(s, "আজই", fps, 150);
  const tipAt = todayAt - 10;
  const tip = spring({ frame: frame - tipAt, fps, config: { damping: 18, stiffness: 90 } });
  return (
    <AbsoluteFill>
      <Backdrop color={C.blood} shape="rgba(255,255,255,0.08)" seed="cta" />
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Rise at={2}>
          <Brand />
        </Rise>
      </div>
      <div style={{ position: "absolute", top: 260, left: 80, right: 80 }}>
        <Kinetic text="আপনার মতো স্বেচ্ছাসেবক দরকার" at={wordFrame(s, "স্বেচ্ছাসেবক", fps, 30) - 8} size={118} accent={{ word: "স্বেচ্ছাসেবক", color: C.marigold }} />
      </div>
      <div style={{ position: "absolute", top: 760, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ rotate: `${interpolate(tip, [0, 1], [0, -118])}deg`, transformOrigin: "50% 80%" }}>
          <Bucket size={300} water={1 - tip * 0.9} />
        </div>
      </div>
      {[...Array(14)].map((_, i) => {
        const t = frame - tipAt - 8 - i * 2;
        if (t < 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 350 + (i % 4) * 14 - t * 2,
              top: 900 + t * t * 0.5,
              width: 26,
              height: 34,
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background: WATER,
              opacity: interpolate(t, [0, 26], [1, 0], clamp),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", top: 1170, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Sequence from={todayAt} durationInFrames={45}>
          <Audio src={staticFile("sfx/ding.wav")} volume={0.4} />
        </Sequence>
        <Pop at={todayAt}>
          <div style={{ padding: "24px 44px", borderRadius: 999, background: C.white, color: C.ink, fontFamily: display, fontWeight: 800, fontSize: 56, boxShadow: hardShadow(10) }}>{siteUrl}</div>
        </Pop>
      </div>
      <div style={{ position: "absolute", bottom: 60, left: 60, right: 60, textAlign: "center", fontFamily: body, fontSize: 22, color: "rgba(255,255,255,0.75)" }}>
        ডেমো ছবি: OakleyOriginals, chris.rycroft (CC BY 2.0)
      </div>
    </AbsoluteFill>
  );
};
