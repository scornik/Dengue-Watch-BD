// Government explainer, 1920×1080, for city corporations, DGHS and ward councillors.
// Content area is y 60–860; captions sit below. Beats are keyed to spoken words via wordFrame.
import type React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bucket, Check, Pin, WATER } from "../components/Icons";
import { Backdrop, CountUp, Kinetic, Pop, Rise, progress } from "../components/motion";
import { Brand, Tag } from "../components/ui";
import { C, bn, body, display, hardShadow } from "../theme";
import { wordFrame, type ManifestScene } from "../timeline";

type SP = { s: ManifestScene };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Deterministic pseudo-random in [0,1). */
const rnd = (i: number, k = 1) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const Panel: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; bg?: string }> = ({ children, style, bg = C.white }) => (
  <div style={{ background: bg, borderRadius: 32, border: `5px solid ${C.ink}`, boxShadow: hardShadow(10), ...style }}>{children}</div>
);

/* 1 ─ Hook: a ward is thousands of rooftops. */
export const Hook: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const thousands = wordFrame(s, "হাজারো", fps, 150);
  const cols = 22;
  const rows = 14;
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="ghook" />
      <div style={{ position: "absolute", left: 110, top: 120, width: 820 }}>
        <Rise at={0}>
          <Brand />
        </Rise>
        <Kinetic text="প্রজননস্থল খুঁজে বের করাই সবচেয়ে কঠিন কাজ" at={wordFrame(s, "প্রজননস্থল", fps, 40) - 6} size={96} align="left" accent={{ word: "কঠিন", color: C.marigold }} style={{ marginTop: 40 }} />
        <div style={{ display: "flex", gap: 18, marginTop: 50, flexWrap: "wrap" }}>
          {["ছাদ", "ড্রেন", "নির্মাণাধীন"].map((w) => (
            <Pop key={w} at={wordFrame(s, w, fps, thousands + 10)}>
              <Tag size={40}>{w === "নির্মাণাধীন" ? "নির্মাণাধীন ভবন" : w}</Tag>
            </Pop>
          ))}
        </div>
      </div>
      {/* the ward: rooftops ripple in from the centre */}
      <div style={{ position: "absolute", left: 1000, top: 110, width: 820, height: 740, borderRadius: 30, overflow: "hidden", background: "#141834" }}>
        {Array.from({ length: cols * rows }).map((_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const d = Math.hypot(c - cols / 2, r - rows / 2);
          const at = thousands - 30 + d * 2.2;
          const breeding = rnd(i) > 0.93;
          const lit = progress(frame, at, at + 10);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 16 + c * 36.5,
                top: 16 + r * 51.5,
                width: 28,
                height: 40,
                borderRadius: 5,
                background: breeding && frame > thousands + 40 ? C.blood : `rgba(233,241,247,${0.08 + 0.32 * lit})`,
                scale: String(0.4 + 0.6 * lit),
              }}
            />
          );
        })}
        <div style={{ position: "absolute", right: 24, bottom: 24 }}>
          <Pop at={thousands + 44}>
            <Tag bg={C.blood} color={C.white} size={34}>
              কোথায় পানি জমে আছে?
            </Tag>
          </Pop>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* 2 ─ Each citizen report is structured data. */
export const Citizens: React.FC<SP> = ({ s }) => {
  const { fps } = useVideoConfig();
  const fields = [
    { w: "ছবি", k: "ছবি", v: "ঘটনাস্থলে তোলা" },
    { w: "জিপিএস", k: "জিপিএস", v: `${bn("23.8103")}° উ, ${bn("90.4125")}° পূ` },
    { w: "ধরন", k: "স্থানের ধরন", v: "বালতি / ড্রাম" },
    { w: "লার্ভা", k: "লার্ভা দেখা গেছে", v: "হ্যাঁ" },
  ];
  return (
    <AbsoluteFill>
      <Backdrop color={C.sky} seed="gcit" />
      <div style={{ position: "absolute", left: 110, top: 150, width: 760 }}>
        <Kinetic text="নাগরিকেরাই মাঠের চোখ" at={wordFrame(s, "নাগরিকদের", fps, 30) - 10} size={104} color={C.ink} align="left" accent={{ word: "চোখ", color: C.blood }} />
        <Rise at={wordFrame(s, "প্রতিটি", fps, 120)} style={{ marginTop: 34, fontFamily: body, fontWeight: 400, fontSize: 44, color: C.muted, lineHeight: 1.45 }}>
          প্রতিটি রিপোর্ট একটি গোছানো তথ্য-সারি, সরাসরি ওয়ার্ডের তালিকায়।
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 980, top: 110 }}>
        <Pop at={wordFrame(s, "প্রতিটি", fps, 120) - 4} from={0.7}>
          <Panel style={{ width: 830, padding: 34, display: "flex", gap: 34 }}>
            <div style={{ width: 250, height: 300, borderRadius: 22, background: "#2a2f45", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bucket size={200} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
              {fields.map((f, i) => (
                <Rise key={f.k} at={wordFrame(s, f.w, fps, 160 + i * 20)} distance={30}>
                  <div style={{ fontFamily: body, fontWeight: 400, fontSize: 28, color: C.muted }}>{f.k}</div>
                  <div style={{ fontFamily: display, fontWeight: 800, fontSize: 40, color: i === 3 ? C.blood : C.ink }}>{f.v}</div>
                </Rise>
              ))}
            </div>
          </Panel>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 3 ─ Screening and duplicate merge. */
export const Screening: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const aiAt = wordFrame(s, "এআই", fps, 20);
  const modAt = wordFrame(s, "স্বেচ্ছাসেবক", fps, 80);
  const mergeAt = wordFrame(s, "পঁচিশ", fps, 200);
  const m = spring({ frame: frame - mergeAt - 10, fps, config: { damping: 16 } });
  const pins = [
    [-120, -80],
    [110, -110],
    [140, 90],
    [-90, 120],
  ];
  const Step: React.FC<{ at: number; n: string; label: string; color: string }> = ({ at, n, label, color }) => (
    <Pop at={at}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 96, height: 96, borderRadius: 26, background: color, border: `5px solid ${C.white}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: display, fontWeight: 800, fontSize: 52, color: C.white }}>{n}</div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 56, color: C.white }}>{label}</div>
      </div>
    </Pop>
  );
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="gscr" />
      <div style={{ position: "absolute", left: 110, top: 130, display: "flex", flexDirection: "column", gap: 44 }}>
        <Step at={aiAt} n={bn(1)} label="ফোনেই এআই যাচাই" color={C.violet} />
        <Step at={modAt} n={bn(2)} label="স্বেচ্ছাসেবক যাচাইকারী" color={C.marigold700} />
        <Step at={mergeAt} n={bn(3)} label="একই জায়গা, একটি স্থান" color={C.neem} />
        <Rise at={wordFrame(s, "দুবার", fps, 300)} style={{ marginLeft: 120 }}>
          <Tag bg={C.white} size={38}>
            একই কাজ দুবার হয় না
          </Tag>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 1300, top: 450 }}>
        <div
          style={{
            position: "absolute",
            left: -230,
            top: -230,
            width: 460,
            height: 460,
            borderRadius: "50%",
            border: `5px dashed ${C.sky200}`,
            opacity: progress(frame, mergeAt, mergeAt + 10),
          }}
        />
        <div style={{ position: "absolute", left: -120, top: 250, width: 240, textAlign: "center", fontFamily: body, fontWeight: 700, fontSize: 36, color: C.sky200, opacity: progress(frame, mergeAt + 6, mergeAt + 16) }}>
          {bn(25)} মিটার
        </div>
        {pins.map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", left: x * (1 - m) - 35, top: y * (1 - m) - 85, opacity: interpolate(frame, [i * 6, i * 6 + 6], [0, 1], clamp) }}>
            <Pin size={70} color={m > 0.9 && i > 0 ? "transparent" : C.blood} />
          </div>
        ))}
        <Pop at={mergeAt + 24} style={{ position: "absolute", left: 60, top: -150 }}>
          <Tag bg={C.blood} color={C.white} size={34}>
            {bn(4)}টি রিপোর্ট → {bn(1)}টি স্থান
          </Tag>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 4 ─ Inspector queue: cards move across statuses; an after photo is required to close. */
const COLS = [
  { label: "নতুন", color: C.blood },
  { label: "যাচাই হয়েছে", color: C.violet },
  { label: "দায়িত্ব দেওয়া", color: C.marigold700 },
  { label: "পরিষ্কার", color: C.neem },
];

export const Queue: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colAt = COLS.map((c, i) => wordFrame(s, ["নতুন", "যাচাই", "দায়িত্ব", "পরিষ্কার"][i], fps, 90 + i * 25));
  const lockAt = wordFrame(s, "পরের", fps, 300);
  // Three cards, each advancing one column at each status word.
  const cards = [0, 1, 2];
  return (
    <AbsoluteFill>
      <Backdrop color={C.sky} seed="gq" />
      <div style={{ position: "absolute", left: 110, top: 70 }}>
        <Kinetic text="প্রতিটি ওয়ার্ডের নিজের কাজের তালিকা" at={0} size={78} color={C.ink} align="left" accent={{ word: "তালিকা", color: C.neem }} />
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 220, display: "flex", gap: 30 }}>
        {COLS.map((c, i) => (
          <Pop key={c.label} at={colAt[i] - 4} from={0.8} style={{ flex: 1 }}>
            <div style={{ height: 580, borderRadius: 26, background: C.white, border: `5px solid ${C.ink}`, boxShadow: hardShadow(8), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: display, fontWeight: 800, fontSize: 40, color: C.ink }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: c.color }} />
                {c.label}
              </div>
            </div>
          </Pop>
        ))}
      </div>
      {cards.map((k) => {
        let col = 0;
        colAt.forEach((at, i) => {
          if (i > 0) col += spring({ frame: frame - at - k * 5, fps, config: { damping: 18 } });
        });
        const colW = (1920 - 220 - 90) / 4;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: 110 + 20 + col * (colW + 30),
              top: 320 + k * 150,
              width: colW - 40,
              height: 124,
              borderRadius: 18,
              background: C.sky,
              border: `4px solid ${C.ink}`,
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "0 16px",
              opacity: progress(frame, colAt[0], colAt[0] + 8),
            }}
          >
            <div style={{ width: 90, height: 90, borderRadius: 12, background: "#2a2f45", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bucket size={74} water={col > 2.9 ? 0 : 1} />
            </div>
            <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: C.ink, lineHeight: 1.3 }}>
              ওয়ার্ড {bn(12 + k * 7)}
              <br />
              <span style={{ color: C.muted, fontWeight: 400 }}>{["বালতি", "টায়ার", "ছাদ"][k]}</span>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", right: 110, top: 836 }}>
        <Pop at={lockAt}>
          <Tag bg={C.neem} color={C.white} size={36}>
            <Check size={36} /> বন্ধ করতে ঘটনাস্থলের ছবি লাগবে
          </Tag>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 5 ─ Ward risk layer, with the satellite caveat on screen. */
export const Risk: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layers = [
    { w: "স্যাটেলাইটের", label: "স্যাটেলাইট: সবুজ, পানি, তাপমাত্রা", color: C.violet },
    { w: "বৃষ্টি", label: "বৃষ্টি", color: WATER },
    { w: "রোগীর", label: "সরকারি রোগীর সংখ্যা", color: C.blood },
  ];
  const riskAt = wordFrame(s, "ঝুঁকি", fps, 160);
  const caveatAt = wordFrame(s, "পাত্র", fps, 420);
  const palette = [C.risk.green, C.risk.yellow, C.risk.orange, C.risk.red];
  const hex = (col: number, row: number) => ({ x: col * 92 + (row % 2) * 46, y: row * 80 });
  return (
    <AbsoluteFill>
      <Backdrop color={C.ink} seed="grisk" />
      <div style={{ position: "absolute", left: 110, top: 110, width: 780 }}>
        <Kinetic text="কোথায় আগে খুঁজতে হবে" at={wordFrame(s, "কোথায়", fps, 220) - 6} size={88} align="left" accent={{ word: "আগে", color: C.marigold }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 44 }}>
          {layers.map((l, i) => (
            <Rise key={l.w} at={wordFrame(s, l.w, fps, 10 + i * 40)} distance={30}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: body, fontWeight: 700, fontSize: 40, color: C.white }}>
                <div style={{ width: 60, height: 22, borderRadius: 6, background: l.color, rotate: "-8deg" }} />
                {l.label}
              </div>
            </Rise>
          ))}
        </div>
        <Pop at={caveatAt} from={0.8} style={{ marginTop: 50 }}>
          <div style={{ background: C.marigold50, color: C.ink, borderRadius: 24, padding: "22px 30px", fontFamily: body, fontWeight: 700, fontSize: 36, lineHeight: 1.4, border: `4px solid ${C.marigold}` }}>
            স্যাটেলাইট পাত্র দেখতে পায় না। এটি শুধু অগ্রাধিকার ঠিক করে।
          </div>
        </Pop>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 130, width: 820, height: 700, perspective: 1600 }}>
        <div style={{ position: "absolute", inset: 0, rotate: "x 28deg", transformStyle: "preserve-3d" }}>
          {Array.from({ length: 8 * 8 }).map((_, i) => {
            const c = i % 8;
            const r = Math.floor(i / 8);
            const { x, y } = hex(c, r);
            const level = Math.min(3, Math.floor(rnd(i, 3) * 2.2 + (c + r > 8 ? 1.4 : 0)));
            const at = riskAt + (c + r) * 2;
            const t = progress(frame, at, at + 14);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x + 20,
                  top: y + 20,
                  width: 84,
                  height: 96,
                  clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
                  background: t > 0.01 ? palette[level] : C.ink700,
                  opacity: 0.35 + 0.65 * t,
                  scale: String(0.9 + 0.1 * t),
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* 6 ─ Public ward scorecard + weekly digest. Numbers are labelled as sample data. */
export const Scorecard: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const speedAt = wordFrame(s, "দ্রুত", fps, 60);
  const pctAt = wordFrame(s, "শতাংশ", fps, 160);
  const digestAt = wordFrame(s, "সাপ্তাহিক", fps, 260);
  const ring = progress(frame, pctAt - 10, pctAt + 30);
  const R = 150;
  return (
    <AbsoluteFill>
      <Backdrop color={C.marigold} shape="rgba(255,255,255,0.2)" seed="gsc" />
      <div style={{ position: "absolute", left: 110, top: 80, right: 110, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Kinetic text="ওয়ার্ড স্কোরকার্ড, সবার জন্য উন্মুক্ত" at={0} size={78} color={C.ink} align="left" />
        <Rise at={10}>
          <Tag bg={C.ink} color={C.white} size={30}>
            নমুনা তথ্য
          </Tag>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, top: 240, display: "flex", gap: 40 }}>
        <Pop at={speedAt} from={0.7} style={{ flex: 1 }}>
          <Panel style={{ height: 560, padding: 44, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: body, fontWeight: 700, fontSize: 38, color: C.muted }}>পরিষ্কার হতে মাঝামাঝি সময়</div>
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 190, color: C.ink, lineHeight: 1.1 }}>
              <CountUp to={38} at={speedAt} dur={30} format={bn} />
              <span style={{ fontSize: 70 }}> ঘণ্টা</span>
            </div>
          </Panel>
        </Pop>
        <Pop at={pctAt - 12} from={0.7} style={{ flex: 1 }}>
          <Panel style={{ height: 560, padding: 44, display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ position: "relative", width: 2 * R + 40, height: 2 * R + 40, flexShrink: 0 }}>
              <svg width={2 * R + 40} height={2 * R + 40}>
                <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke={C.neem50} strokeWidth={36} />
                <circle
                  cx={R + 20}
                  cy={R + 20}
                  r={R}
                  fill="none"
                  stroke={C.neem}
                  strokeWidth={36}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * R}
                  strokeDashoffset={2 * Math.PI * R * (1 - 0.74 * ring)}
                  transform={`rotate(-90 ${R + 20} ${R + 20})`}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: display, fontWeight: 800, fontSize: 96, color: C.ink }}>
                {bn(Math.round(74 * ring))}%
              </div>
            </div>
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 54, color: C.ink, lineHeight: 1.2 }}>
              {bn(72)} ঘণ্টার মধ্যে পরিষ্কার
            </div>
          </Panel>
        </Pop>
      </div>
      <div style={{ position: "absolute", right: 110, top: 828 }}>
        <Pop at={digestAt}>
          <Tag bg={C.ink} color={C.white} size={36}>
            ✉ সাপ্তাহিক সারাংশ → ওয়ার্ড অ্যাডমিন
          </Tag>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

/* 7 ─ Open source and open data. */
export const Open: React.FC<SP> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dataAt = wordFrame(s, "সিএসভি", fps, 120);
  const files = [
    { name: "sites.csv", color: C.neem700 },
    { name: "sites.geojson", color: C.violet },
  ];
  return (
    <AbsoluteFill>
      <Backdrop color={C.neem} shape="rgba(255,255,255,0.08)" seed="gopen" />
      <div style={{ position: "absolute", left: 110, top: 150, width: 900 }}>
        <Pop at={wordFrame(s, "ওপেন", fps, 20) - 6}>
          <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 190, color: C.marigold, lineHeight: 1 }}>{"</>"}</div>
        </Pop>
        <Kinetic text="ওপেন সোর্স · উন্মুক্ত তথ্য" at={wordFrame(s, "ওপেন", fps, 20)} size={96} align="left" style={{ marginTop: 30 }} />
        <Rise at={wordFrame(s, "নাম-পরিচয়হীন", fps, 80)} style={{ marginTop: 30, fontFamily: body, fontWeight: 400, fontSize: 42, color: C.neem50, lineHeight: 1.4 }}>
          নাম-পরিচয়হীন, অবস্থান ~{bn(50)} মিটারে গোল করা, বিনা মূল্যে
        </Rise>
      </div>
      <div style={{ position: "absolute", left: 1180, top: 190, display: "flex", flexDirection: "column", gap: 40 }}>
        {files.map((f, i) => {
          const at = dataAt + i * 14;
          const drop = spring({ frame: frame - at, fps, config: { damping: 11 } });
          return (
            <div key={f.name} style={{ translate: `0px ${interpolate(drop, [0, 1], [-260, 0])}px`, opacity: interpolate(frame, [at, at + 4], [0, 1], clamp) }}>
              <Panel style={{ width: 560, padding: "34px 40px", display: "flex", alignItems: "center", gap: 30 }}>
                <div style={{ width: 96, height: 120, borderRadius: 12, background: f.color, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12, fontFamily: body, fontWeight: 700, fontSize: 24, color: C.white }}>
                  {f.name.split(".")[1].toUpperCase()}
                </div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 40, color: C.ink }}>{f.name}</div>
                <div style={{ marginLeft: "auto", fontSize: 54, color: C.neem }}>↓</div>
              </Panel>
            </div>
          );
        })}
        <Rise at={dataAt + 34}>
          <Tag bg={C.white} size={34}>
            কোড: AGPL-3.0 · GitHub
          </Tag>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

/* 8 ─ Call to action: start with one ward. */
export const Cta: React.FC<SP & { siteUrl: string; contact: string }> = ({ s, siteUrl, contact }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const oneAt = wordFrame(s, "একটি", fps, 0);
  const goalAt = wordFrame(s, "লক্ষ্য", fps, 90);
  const contactAt = wordFrame(s, "যোগাযোগ", fps, 280);
  const zoom = spring({ frame: frame - oneAt - 6, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill>
      <Backdrop color={C.blood} shape="rgba(255,255,255,0.08)" seed="gcta" />
      <div style={{ position: "absolute", left: 1080, top: 120, width: 720, height: 700 }}>
        {Array.from({ length: 6 * 6 }).map((_, i) => {
          const c = i % 6;
          const r = Math.floor(i / 6);
          const pilot = c === 3 && r === 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: c * 120,
                top: r * 116,
                width: 110,
                height: 106,
                borderRadius: 16,
                background: pilot ? C.white : "rgba(255,255,255,0.14)",
                scale: pilot ? String(1 + 0.25 * zoom) : String(1 - 0.08 * zoom),
                boxShadow: pilot ? hardShadow(8) : undefined,
                zIndex: pilot ? 2 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: display,
                fontWeight: 800,
                fontSize: 28,
                color: C.blood,
              }}
            >
              {pilot ? "পাইলট" : ""}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 110, top: 120, width: 900 }}>
        <Kinetic text="একটি ওয়ার্ড দিয়ে শুরু করুন" at={oneAt} size={100} align="left" />
        <Pop at={goalAt} from={0.7} style={{ marginTop: 40, display: "inline-block" }}>
          <div style={{ background: C.white, color: C.ink, borderRadius: 28, padding: "24px 36px", fontFamily: display, fontWeight: 800, fontSize: 52, boxShadow: hardShadow(8) }}>
            লক্ষ্য: যাচাই হওয়া রিপোর্টের বেশিরভাগ {bn(72)} ঘণ্টায় পরিষ্কার
          </div>
        </Pop>
        <Rise at={contactAt} style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 60, color: C.white }}>{siteUrl}</div>
          <div style={{ fontFamily: body, fontWeight: 700, fontSize: 42, color: C.blood50 }}>{contact}</div>
        </Rise>
        <Rise at={contactAt + 12} style={{ marginTop: 40 }}>
          <Brand />
        </Rise>
      </div>
    </AbsoluteFill>
  );
};
