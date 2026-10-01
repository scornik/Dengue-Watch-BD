// Citizen explainer, 1080×1920. Every on-screen beat is keyed to the frame where the narrator says
// the matching word (wordFrame), so visuals land on the voice even after the voice is re-generated.
import { noise2D } from "@remotion/noise";
import type React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AcTray, Bucket, Check, Construction, Drum, FlowerTub, Mosquito, Pin, Tire, WATER } from "../components/Icons";
import { Backdrop, CountUp, Kinetic, Pop, Rise, easeOut, progress } from "../components/motion";
import { Phone } from "../components/Phone";
import { Brand, Tag } from "../components/ui";
import { C, bn, body, display, hardShadow } from "../theme";
import { wordFrame, type ManifestScene } from "../timeline";

type SP = { s: ManifestScene };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* 1 ─ Hook: a mosquito drifts over a Dhaka rooftop at night. */
export const Hook: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const born = wordFrame(s, "জন্ম", fps, 90);
  const fly = progress(frame, 0, born + 20, Easing.bezier(0.33, 0, 0.2, 1));
  const mx = interpolate(fly, [0, 1], [-200, 610]) + noise2D("mx", frame / 40, 0) * 30;
  const my = interpolate(fly, [0, 1], [700, 860]) + noise2D("my", 0, frame / 30) * 40;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="hook" />
      {/* stars */}
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
        <Kinetic text="এই মুহূর্তে আপনার ছাদে" at={wordFrame(s, "এই", fps, 60) - 6} size={112} />
        <Kinetic text="জন্ম নিচ্ছে ডেঙ্গুর মশা" at={born - 4} size={112} accent={{ word: "মশা", color: C.blood }} style={{ marginTop: 10 }} />
      </div>
      {/* rooftop */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 1060, height: 300 }}>
        <div style={{ position: "absolute", left: 60, right: 60, top: 120, height: 26, background: C.ink700, borderRadius: 8 }} />
        <div style={{ position: "absolute", left: 60, right: 60, top: 146, height: 400, background: "#141834" }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ position: "absolute", left: 110 + i * 180, top: 200, width: 90, height: 70, background: i === 2 ? C.marigold : "#232850", borderRadius: 6 }} />
        ))}
        <Pop at={wordFrame(s, "ছাদে", fps, 20)} style={{ position: "absolute", left: 150, top: -40 }}>
          <Bucket size={170} />
        </Pop>
        <Pop at={wordFrame(s, "বারান্দায়", fps, 30)} style={{ position: "absolute", left: 440, top: -45 }}>
          <FlowerTub size={175} />
        </Pop>
        <Pop at={wordFrame(s, "এসির", fps, 40)} style={{ position: "absolute", left: 720, top: -30 }}>
          <AcTray size={160} />
        </Pop>
      </div>
      <div style={{ position: "absolute", left: mx, top: my, rotate: `${noise2D("mr", frame / 25, 1) * 10}deg` }}>
        <Mosquito size={190} wing={Math.abs(Math.sin(frame * 1.6))} color="#e8ebf7" />
      </div>
    </AbsoluteFill>
  );
};

/* 2 ─ Where Aedes breed: six containers pop in as they are named. */
const Card: React.FC<{ at: number; label: string; children: React.ReactNode; tint?: string }> = ({ at, label, children, tint = C.white }) => {
  const frame = useCurrentFrame();
  const fill = progress(frame, at + 4, at + 30);
  return (
    <Pop at={at}>
      <div
        style={{
          width: 430,
          height: 290,
          borderRadius: 36,
          background: tint,
          boxShadow: hardShadow(10),
          border: `5px solid ${C.ink}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <div style={{ height: 190, display: "flex", alignItems: "center" }}>
          {children}
        </div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 52, color: C.ink, opacity: interpolate(fill, [0, 0.4], [0, 1]) }}>{label}</div>
      </div>
    </Pop>
  );
};

export const Where: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lvl = (w: string, f: number) => progress(frame, wordFrame(s, w, fps, f) + 4, wordFrame(s, w, fps, f) + 30);
  return (
    <AbsoluteFill>
      <Backdrop color={C.sky} shape="rgba(59,155,216,0.10)" seed="where" />
      <div style={{ position: "absolute", top: 150, left: 80, right: 80 }}>
        <Rise at={0}>
          <Tag bg={C.ink} color={C.white}>
            এডিস মশা ডিম পাড়ে
          </Tag>
        </Rise>
        <Kinetic
          text="জমে থাকা পরিষ্কার পানিতে"
          at={wordFrame(s, "জমে", fps, 30) - 4}
          size={104}
          color={C.ink}
          align="left"
          accent={{ word: "পানিতে", color: WATER }}
          style={{ marginTop: 34 }}
        />
      </div>
      <div style={{ position: "absolute", top: 530, left: 80, right: 80, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <Card at={wordFrame(s, "টায়ার", fps, 90)} label="টায়ার">
          <Tire size={190} water={lvl("টায়ার", 90)} />
        </Card>
        <Card at={wordFrame(s, "বালতি", fps, 100)} label="বালতি">
          <Bucket size={190} water={lvl("বালতি", 100)} />
        </Card>
        <Card at={wordFrame(s, "ড্রাম", fps, 110)} label="ড্রাম">
          <Drum size={190} water={lvl("ড্রাম", 110)} />
        </Card>
        <Card at={wordFrame(s, "ফুলের", fps, 120)} label="ফুলের টব">
          <FlowerTub size={190} water={lvl("ফুলের", 120)} />
        </Card>
      </div>
      <div style={{ position: "absolute", top: 1170, left: 80, right: 80, display: "flex", justifyContent: "center" }}>
        <Pop at={wordFrame(s, "নির্মাণাধীন", fps, 140)}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Construction size={120} water={lvl("নির্মাণাধীন", 140)} />
            <Tag size={46}>নির্মাণাধীন ভবন</Tag>
          </div>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 3 ─ Reporting: phone takes a photo, drops a pin, done. */
export const Report: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shot = wordFrame(s, "তুলুন", fps, 40);
  const mapAt = wordFrame(s, "মানচিত্রে", fps, 70);
  const pinAt = wordFrame(s, "ঠিক", fps, 90);
  const thirty = wordFrame(s, "ত্রিশ", fps, 130);
  const noSignup = wordFrame(s, "নিবন্ধন", fps, 180);
  const flash = interpolate(frame, [shot, shot + 2, shot + 10], [0, 1, 0], clamp);
  const toMap = progress(frame, mapAt - 6, mapAt + 10);
  const pinDrop = spring({ frame: frame - pinAt, fps, config: { damping: 9, stiffness: 180 } });
  const ring = progress(frame, thirty, thirty + 40, Easing.linear);
  return (
    <AbsoluteFill>
      <Backdrop color={C.marigold} shape="rgba(255,255,255,0.18)" seed="report" />
      <div style={{ position: "absolute", top: 140, left: 80, right: 80 }}>
        <Kinetic text="একটি ছবি তুলুন" at={wordFrame(s, "একটি", fps, 20) - 4} size={110} color={C.ink} align="left" />
        <Kinetic text="জায়গাটি ঠিক করুন" at={mapAt - 4} size={110} color={C.ink} align="left" />
      </div>
      <div style={{ position: "absolute", top: 500, left: 110 }}>
        <Rise at={0} distance={140}>
          <Phone width={400}>
            {/* camera view */}
            <AbsoluteFill style={{ background: "#2a2f45", opacity: 1 - toMap, alignItems: "center", justifyContent: "center" }}>
              <div style={{ scale: String(interpolate(frame, [0, shot], [1.25, 1], { ...clamp, easing: easeOut })) }}>
                <Bucket size={260} />
              </div>
              <div style={{ position: "absolute", inset: 60, border: "4px solid rgba(255,255,255,0.7)", borderRadius: 20 }} />
              <div style={{ position: "absolute", bottom: 50, width: 110, height: 110, borderRadius: 55, border: "8px solid white", background: frame > shot ? C.white : "transparent" }} />
              <AbsoluteFill style={{ background: C.white, opacity: flash }} />
            </AbsoluteFill>
            {/* map view */}
            <AbsoluteFill style={{ opacity: toMap, background: "#eef2e6" }}>
              {[...Array(9)].map((_, i) => (
                <div key={"h" + i} style={{ position: "absolute", left: 0, right: 0, top: 40 + i * 100, height: i % 3 === 1 ? 22 : 10, background: C.white }} />
              ))}
              {[...Array(5)].map((_, i) => (
                <div key={"v" + i} style={{ position: "absolute", top: 0, bottom: 0, left: 30 + i * 100, width: i === 2 ? 22 : 10, background: C.white }} />
              ))}
              <div style={{ position: "absolute", left: 200, top: 400, width: 120, height: 120, borderRadius: 60, background: "rgba(215,38,61,0.15)", scale: String(pinDrop) }} />
              <div style={{ position: "absolute", left: 215, top: interpolate(pinDrop, [0, 1], [160, 350]), opacity: pinDrop > 0.01 ? 1 : 0 }}>
                <Pin size={90} />
              </div>
            </AbsoluteFill>
          </Phone>
        </Rise>
      </div>
      {/* 30-second ring */}
      <div style={{ position: "absolute", right: 70, top: 640 }}>
        <Pop at={thirty}>
          <div style={{ position: "relative", width: 330, height: 330 }}>
            <svg width={330} height={330} viewBox="0 0 330 330" style={{ position: "absolute" }}>
              <circle cx="165" cy="165" r="140" fill={C.ink} />
              <circle
                cx="165"
                cy="165"
                r="140"
                fill="none"
                stroke={C.white}
                strokeWidth="22"
                strokeDasharray={2 * Math.PI * 140}
                strokeDashoffset={2 * Math.PI * 140 * (1 - ring)}
                transform="rotate(-90 165 165)"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.white }}>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 120, lineHeight: 1 }}>
                <CountUp to={30} at={thirty} dur={40} format={bn} />
              </div>
              <div style={{ fontFamily: body, fontWeight: 700, fontSize: 40 }}>সেকেন্ড</div>
            </div>
          </div>
        </Pop>
      </div>
      <div style={{ position: "absolute", right: 70, top: 1030 }}>
        <Pop at={noSignup}>
          <Tag bg={C.neem} color={C.white} size={42}>
            <Check size={44} /> নিবন্ধন লাগে না
          </Tag>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 4 ─ Privacy: blur boxes land on a face and a plate; the pin snaps to a ~50 m grid. */
export const Privacy: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blurAt = wordFrame(s, "ঝাপসা", fps, 70);
  const approxAt = wordFrame(s, "আনুমানিক", fps, 170);
  const b = progress(frame, blurAt, blurAt + 12);
  const snap = spring({ frame: frame - approxAt, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="privacy" />
      <div style={{ position: "absolute", top: 150, left: 80, right: 80 }}>
        <Kinetic text="মুখ ও নম্বরপ্লেট ঝাপসা" at={wordFrame(s, "মানুষের", fps, 0)} size={100} align="left" accent={{ word: "ঝাপসা", color: C.marigold }} />
      </div>
      {/* street "photo" */}
      <div style={{ position: "absolute", top: 400, left: 80, right: 80, height: 470, borderRadius: 36, overflow: "hidden", background: "#cfe0ec", border: `6px solid ${C.white}` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 130, background: "#8d96a8" }} />
        <div style={{ position: "absolute", left: 40, bottom: 130, width: 260, height: 260, background: "#e3c8a0", borderRadius: 8 }} />
        {/* person */}
        <div style={{ position: "absolute", left: 380, bottom: 110, width: 110, height: 200, borderRadius: "50px 50px 10px 10px", background: C.blood700 }} />
        <div style={{ position: "absolute", left: 395, bottom: 300, width: 80, height: 80, borderRadius: 40, background: "#b07a50" }} />
        {/* car */}
        <div style={{ position: "absolute", left: 560, bottom: 60, width: 330, height: 140, borderRadius: 40, background: C.marigold700 }} />
        <div style={{ position: "absolute", left: 670, bottom: 75, width: 110, height: 40, borderRadius: 6, background: C.white, fontFamily: body, fontWeight: 700, fontSize: 24, color: C.ink, textAlign: "center", lineHeight: "40px" }}>
          ঢাকা মেট্রো
        </div>
        <div style={{ position: "absolute", left: 90, bottom: 110 }}>
          <Bucket size={150} />
        </div>
        {/* blur patches */}
        {[
          { l: 380, b: 290, w: 110, h: 100 },
          { l: 655, b: 65, w: 140, h: 60 },
        ].map((r, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: r.l,
              bottom: r.b,
              width: r.w,
              height: r.h,
              borderRadius: 16,
              backdropFilter: `blur(${18 * b}px)`,
              background: `rgba(255,255,255,${0.12 * b})`,
              outline: `${5 * b}px dashed ${C.marigold}`,
              scale: String(interpolate(b, [0, 1], [1.4, 1])),
              opacity: b,
            }}
          />
        ))}
      </div>
      {/* approximate location */}
      <div style={{ position: "absolute", top: 940, left: 80, right: 80, height: 330, borderRadius: 36, overflow: "hidden", background: "#eef2e6", border: `6px solid ${C.white}` }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{ position: "absolute", left: (i % 6) * 160 + 40, top: Math.floor(i / 6) * 160 + 40, width: 120, height: 120, border: "3px dashed rgba(27,31,59,0.18)", borderRadius: 10 }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: interpolate(snap, [0, 1], [415, 460]),
            top: interpolate(snap, [0, 1], [70, 95]) - 20,
          }}
        >
          <Pin size={70} color={C.violet} />
        </div>
        <Pop at={approxAt + 6} style={{ position: "absolute", right: 30, bottom: 26 }}>
          <Tag bg={C.ink} color={C.white} size={38}>
            আনুমানিক অবস্থান · ~{bn(50)} মি
          </Tag>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 5 ─ Ward team: status pipeline, then before → after proof. */
const STATUSES = [
  { label: "নতুন", color: C.blood },
  { label: "যাচাই হয়েছে", color: C.violet },
  { label: "দায়িত্ব দেওয়া হয়েছে", color: C.marigold700 },
  { label: "পরিষ্কার হয়েছে", color: C.neem },
];

export const Ward: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = wordFrame(s, "তালিকায়", fps, 40);
  const proofAt = wordFrame(s, "প্রমাণ", fps, 170);
  const step = (i: number) => start + i * 14;
  const line = progress(frame, start, step(3) + 6, Easing.linear);
  const flip = spring({ frame: frame - proofAt, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill>
      <Backdrop color={C.sky} seed="ward" />
      <div style={{ position: "absolute", top: 140, left: 80, right: 80 }}>
        <Kinetic text="সরাসরি আপনার ওয়ার্ডের দলের কাছে" at={wordFrame(s, "সরাসরি", fps, 10) - 4} size={92} color={C.ink} align="left" accent={{ word: "ওয়ার্ডের", color: C.neem }} />
      </div>
      <div style={{ position: "absolute", top: 470, left: 120 }}>
        <div style={{ position: "absolute", left: 30, top: 40, width: 12, height: 3 * 120 * line, background: C.ink, borderRadius: 6 }} />
        {STATUSES.map((st, i) => (
          <div key={st.label} style={{ position: "absolute", top: i * 120, left: 0, width: 860, whiteSpace: "nowrap" }}>
            <Pop at={step(i)}>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ width: 72, height: 72, borderRadius: 36, background: st.color, border: `6px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {i === 3 ? <Check size={40} /> : null}
                </div>
                <div style={{ fontFamily: display, fontWeight: 800, fontSize: 56, color: C.ink }}>{st.label}</div>
              </div>
            </Pop>
          </div>
        ))}
      </div>
      {/* before / after */}
      <div style={{ position: "absolute", top: 1010, left: 80, right: 80, display: "flex", gap: 30 }}>
        {(["আগে", "পরে"] as const).map((label, i) => (
          <Pop key={label} at={proofAt + i * 8} style={{ flex: 1 }}>
            <div style={{ height: 330, borderRadius: 30, background: i ? C.neem50 : C.blood50, border: `5px solid ${C.ink}`, boxShadow: hardShadow(8), position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ rotate: i ? `${180 * flip}deg` : "0deg" }}>
                <Bucket size={200} water={i ? 1 - flip : 1} />
              </div>
              <div style={{ position: "absolute", top: 18, left: 18 }}>
                <Tag bg={i ? C.neem : C.blood} color={C.white} size={34}>
                  {label}
                </Tag>
              </div>
            </div>
          </Pop>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* 6 ─ Be a hunter: three steps, XP stacks up, you climb the leaderboard. */
const BOARD = [
  { name: "ছাদের_রাজা", xp: 410 },
  { name: "মিরপুর_শিকারি", xp: 365 },
  { name: "আপনি", xp: 330, you: true },
];

export const Hunter: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = [
    { w: "ফেলুন", label: "পানি ফেলুন" },
    { w: "ঘষুন", label: "ভেতরটা ঘষুন" },
    { w: "ঢেকে", label: "ঢেকে দিন" },
  ];
  const xpAt = wordFrame(s, "পয়েন্ট", fps, 260);
  const boardAt = wordFrame(s, "লিডারবোর্ডে", fps, 300);
  const climb = spring({ frame: frame - boardAt - 10, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      <Backdrop color={C.neem} shape="rgba(255,255,255,0.08)" seed="hunter" />
      <div style={{ position: "absolute", top: 140, left: 80, right: 80 }}>
        <Kinetic text="আপনিও শিকারি" at={wordFrame(s, "শিকারি", fps, 30) - 8} size={124} align="left" accent={{ word: "শিকারি", color: C.marigold }} />
      </div>
      <div style={{ position: "absolute", top: 360, left: 80, right: 80, display: "flex", flexDirection: "column", gap: 22 }}>
        {steps.map((st, i) => (
          <Pop key={st.w} at={wordFrame(s, st.w, fps, 120 + i * 30)} from={0.7}>
            <div style={{ display: "flex", alignItems: "center", gap: 26, background: C.white, borderRadius: 28, padding: "20px 30px", boxShadow: hardShadow(8), border: `5px solid ${C.ink}` }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, background: C.marigold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: display, fontWeight: 800, fontSize: 52, color: C.ink }}>
                {bn(i + 1)}
              </div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 64, color: C.ink }}>{st.label}</div>
            </div>
          </Pop>
        ))}
      </div>
      <div style={{ position: "absolute", top: 860, left: 80, right: 80, display: "flex", gap: 20, alignItems: "center" }}>
        <Pop at={xpAt}>
          <Tag bg={C.marigold} color={C.ink} size={60}>
            +<CountUp to={20} at={xpAt} dur={14} format={bn} /> XP
          </Tag>
        </Pop>
        <Pop at={xpAt + 12}>
          <Tag bg={C.white} color={C.ink} size={40}>
            লার্ভা বোনাস +{bn(10)}
          </Tag>
        </Pop>
      </div>
      <div style={{ position: "absolute", top: 990, left: 80, right: 80, height: 300 }}>
        {BOARD.map((r, i) => {
          const rank = r.you ? interpolate(climb, [0, 1], [2, 0]) : i + climb;
          return (
            <Rise key={r.name} at={boardAt + i * 4} distance={30} style={{ position: "absolute", left: 0, right: 0, top: rank * 98 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22, height: 84, padding: "0 28px", borderRadius: 22, background: r.you ? C.marigold : "rgba(255,255,255,0.14)", color: r.you ? C.ink : C.white, fontFamily: body, fontWeight: 700, fontSize: 42 }}>
                <span style={{ width: 50 }}>#{bn(Math.round(rank) + 1)}</span>
                <span style={{ flex: 1 }}>{r.name}</span>
                <span>{bn(r.you ? r.xp + Math.round(climb * 100) : r.xp)} XP</span>
              </div>
            </Rise>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* 7 ─ Call to action: the bucket tips, the water pours out, the brand lands. */
export const Cta: React.FC<SP & { siteUrl: string }> = ({ s, siteUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tip = spring({ frame: frame - wordFrame(s, "ফেলছেন", fps, 30), fps, config: { damping: 18, stiffness: 90 } });
  const todayAt = wordFrame(s, "আজই", fps, 150);
  return (
    <AbsoluteFill>
      <Backdrop color={C.blood} shape="rgba(255,255,255,0.08)" seed="cta" />
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Rise at={2}>
          <Brand />
        </Rise>
      </div>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ rotate: `${interpolate(tip, [0, 1], [0, -118])}deg`, transformOrigin: "50% 80%" }}>
          <Bucket size={330} water={1 - tip * 0.9} />
        </div>
      </div>
      {/* pouring drops */}
      {[...Array(14)].map((_, i) => {
        const t = frame - wordFrame(s, "ফেলছেন", fps, 30) - 8 - i * 2;
        if (t < 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 330 + (i % 4) * 14 - t * 2,
              top: 400 + t * t * 0.5,
              width: 26,
              height: 34,
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background: WATER,
              opacity: interpolate(t, [0, 30], [1, 0], clamp),
            }}
          />
        );
      })}
      <div style={{ position: "absolute", top: 640, left: 80, right: 80 }}>
        <Kinetic text="এডিসের ঘর ভাঙুন" at={wordFrame(s, "শত", fps, 60) - 4} size={150} />
        <Rise at={wordFrame(s, "জন্মাবে", fps, 100)} style={{ marginTop: 30, textAlign: "center", fontFamily: body, fontWeight: 400, fontSize: 52, color: C.blood50 }}>
          শত শত মশা আর জন্মাবে না
        </Rise>
      </div>
      <div style={{ position: "absolute", top: 1160, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <Pop at={todayAt}>
          <div style={{ padding: "26px 54px", borderRadius: 999, background: C.white, color: C.ink, fontFamily: display, fontWeight: 800, fontSize: 66, boxShadow: hardShadow(10) }}>{siteUrl}</div>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};
