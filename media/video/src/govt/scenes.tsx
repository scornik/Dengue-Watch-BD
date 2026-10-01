// For city corporations, 1920×1080. An invitation, not a partnership report: volunteers run it today;
// a city corporation can join by appointing a ward admin and inspectors. The phone plays real screen
// recordings of the app (media/capture/record.mjs); points appear as the narrator says them.
import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AppClip } from "../components/AppClip";
import { Check } from "../components/Icons";
import { Backdrop, Kinetic, Pop, Rise } from "../components/motion";
import { Brand, Tag } from "../components/ui";
import { C, body, display, hardShadow } from "../theme";
import { sceneFrames, wordFrame, type ManifestScene } from "../timeline";

type SP = { s: ManifestScene };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Captions stay in the left column so they never cover the phone. */
export const LEFT_CAPTIONS = { left: 110, right: 880, bottom: 60 };

type Point = { word: string; text: string };

const Slide: React.FC<{
  s: ManifestScene;
  bg: string;
  dark?: boolean;
  badge: string;
  title: string;
  points: Point[];
  clip: "report" | "public" | "staff";
  from: string;
  to: string;
  demo?: boolean;
  note?: { word: string; text: string };
}> = ({ s, bg, dark = false, badge, title, points, clip, from, to, demo, note }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ink = dark ? C.white : C.ink;
  return (
    <AbsoluteFill>
      <Backdrop color={bg} shape={dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.22)"} seed={s.id} />
      <div style={{ position: "absolute", left: 110, top: 90, width: 1080, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 22 }}>
        <Rise at={0}>
          <Tag bg={dark ? C.white : C.ink} color={dark ? C.ink : C.white} size={30}>
            {badge}
          </Tag>
        </Rise>
        <Kinetic text={title} at={3} size={74} color={ink} align="left" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
          {points.map((p) => (
            <Sequence key={"sfx" + p.text} from={wordFrame(s, p.word, fps, 20)} durationInFrames={15} layout="none">
              <Audio src={staticFile("sfx/mouse-click.wav")} volume={0.25} />
            </Sequence>
          ))}
          {points.map((p) => (
            <Rise key={p.text} at={wordFrame(s, p.word, fps, 20)} distance={30}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: body, fontWeight: 700, fontSize: 40, color: ink }}>
                <div style={{ width: 46, height: 46, borderRadius: 23, background: C.neem, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={30} />
                </div>
                {p.text}
              </div>
            </Rise>
          ))}
        </div>
        {note ? (
          <Pop at={wordFrame(s, note.word, fps, 200)} from={0.8}>
            <div style={{ background: C.marigold50, color: C.ink, borderRadius: 22, padding: "16px 26px", fontFamily: body, fontWeight: 700, fontSize: 32, lineHeight: 1.4, border: `4px solid ${C.marigold}`, maxWidth: 820 }}>
              {note.text}
            </div>
          </Pop>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 1360,
          translate: `${interpolate(spring({ frame, fps, config: { damping: 18 } }), [0, 1], [160, 0])}px 0px`,
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      >
        <AppClip clip={clip} from={from} to={to} sceneFrames={sceneFrames(s, fps)} width={455} />
        {demo ? (
          <div style={{ position: "absolute", top: 60, left: -70, rotate: "-6deg" }}>
            <Tag bg={C.marigold} size={24}>
              ডেমো তথ্য
            </Tag>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const Hook: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.ink}
    dark
    badge="ডেঙ্গুওয়াচ বিডি"
    title="একটি ওপেন সোর্স নাগরিক উদ্যোগ"
    clip="report"
    from="home"
    to="tapReport"
    points={[
      { word: "নাগরিকেরা", text: "নাগরিকেরা জমে থাকা পানির ছবি পাঠান" },
      { word: "স্বেচ্ছাসেবকেরা", text: "স্বেচ্ছাসেবকেরা পরিষ্কার করেন" },
      { word: "অগ্রগতি", text: "সবাই অগ্রগতি দেখতে পান" },
    ]}
  />
);

export const Data: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.sky}
    badge="প্রতিটি রিপোর্ট"
    title="গোছানো, যাচাইযোগ্য তথ্য"
    clip="public"
    from="spot"
    to="map"
    demo
    points={[
      { word: "ছবি", text: "ঘটনাস্থলের ছবি" },
      { word: "জিপিএস", text: "জিপিএস অবস্থান" },
      { word: "পাত্রের", text: "পাত্রের ধরন ও লার্ভা" },
      { word: "পঁচিশ", text: "২৫ মিটারের মধ্যে একই স্থান" },
    ]}
  />
);

export const MapScene: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.ink}
    dark
    badge="উন্মুক্ত মানচিত্র"
    title="কোথায় আগে খুঁজতে হবে"
    clip="public"
    from="map"
    to="ward"
    demo
    points={[
      { word: "ওয়ার্ডভিত্তিক", text: "ওয়ার্ডভিত্তিক রিপোর্ট" },
      { word: "পরিবেশগত", text: "পরিবেশগত ঝুঁকি" },
      { word: "রোগীর", text: "সরকারি রোগীর সংখ্যা" },
    ]}
    note={{ word: "পাত্র", text: "স্যাটেলাইট পাত্র দেখতে পায় না; এটি শুধু অগ্রাধিকার দেখায়।" }}
  />
);

export const Scorecard: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.marigold}
    badge="ওয়ার্ড স্কোরকার্ড"
    title="প্রতিটি ওয়ার্ডের অগ্রগতি, সবার সামনে"
    clip="public"
    from="ward"
    to="end"
    demo
    points={[
      { word: "পাওয়া", text: "কতগুলো জায়গা পাওয়া গেছে" },
      { word: "পরিষ্কার", text: "কতগুলো পরিষ্কার হয়েছে" },
      { word: "দ্রুত", text: "কত দ্রুত" },
    ]}
  />
);

export const Join: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.neem}
    dark
    badge="সিটি করপোরেশন চাইলে"
    title="প্রতিটি ওয়ার্ডে নিজের দল"
    clip="staff"
    from="queue"
    to="digest"
    demo
    points={[
      { word: "অ্যাডমিন", text: "ওয়ার্ড অ্যাডমিন ও পরিদর্শক নিয়োগ" },
      { word: "তালিকা", text: "নিজের ওয়ার্ডের কাজের তালিকা" },
      { word: "বন্ধ", text: "ঘটনাস্থলের ছবি দিয়ে বন্ধ" },
    ]}
  />
);

export const Digest: React.FC<SP> = ({ s }) => (
  <Slide
    s={s}
    bg={C.sky}
    badge="ওয়ার্ড অ্যাডমিন"
    title="সাপ্তাহিক সারাংশ ও উন্মুক্ত তথ্য"
    clip="staff"
    from="digest"
    to="end"
    demo
    points={[
      { word: "সাপ্তাহিক", text: "সাপ্তাহিক সারাংশ" },
      { word: "ডাউনলোড", text: "CSV ও GeoJSON, বিনা মূল্যে" },
    ]}
  />
);

export const Cta: React.FC<SP & { siteUrl: string; contact: string }> = ({ s, siteUrl, contact }) => {
  const { fps } = useVideoConfig();
  const joinAt = wordFrame(s, "যুক্ত", fps, 90);
  return (
    <AbsoluteFill>
      <Backdrop color={C.blood} shape="rgba(255,255,255,0.08)" seed="gcta" />
      <div style={{ position: "absolute", left: 110, right: 110, top: 120 }}>
        <Rise at={0}>
          <Brand />
        </Rise>
        <Kinetic text="এখন কাজটি চালাচ্ছেন স্বেচ্ছাসেবকেরা" at={4} size={92} align="left" accent={{ word: "স্বেচ্ছাসেবকেরা", color: C.marigold }} style={{ marginTop: 40 }} />
        <Sequence from={joinAt} durationInFrames={45} layout="none">
          <Audio src={staticFile("sfx/ding.wav")} volume={0.4} />
        </Sequence>
        <Pop at={joinAt} from={0.7} style={{ marginTop: 50, display: "inline-block" }}>
          <div style={{ background: C.white, color: C.ink, borderRadius: 28, padding: "24px 40px", fontFamily: display, fontWeight: 800, fontSize: 60, boxShadow: hardShadow(10) }}>আপনার ওয়ার্ড যুক্ত করুন</div>
        </Pop>
        <Rise at={joinAt + 14} style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 64, color: C.white }}>{siteUrl}</div>
          {contact ? <div style={{ fontFamily: body, fontWeight: 700, fontSize: 42, color: C.blood50 }}>{contact}</div> : null}
        </Rise>
      </div>
    </AbsoluteFill>
  );
};
