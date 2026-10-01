import type React from "react";
import { C } from "../theme";

// Flat, thick-stroke icons drawn for the videos. Water is always the same blue so the eye learns
// "blue = breeding water" across every scene.
export const WATER = "#3b9bd8";
const S = { stroke: C.ink, strokeWidth: 7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type P = { size?: number; water?: number };

export const Tire: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <ellipse cx="100" cy="112" rx="82" ry="50" fill={C.ink} />
    <ellipse cx="100" cy="104" rx="82" ry="50" fill="#2d2f3a" {...S} />
    <ellipse cx="100" cy="104" rx="44" ry="24" fill={C.sky} {...S} />
    <ellipse cx="100" cy="108" rx={40 * water} ry={18 * water} fill={WATER} />
  </svg>
);

export const Bucket: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <path d="M40 60 L58 170 Q100 182 142 170 L160 60 Z" fill={C.marigold} {...S} />
    <ellipse cx="100" cy="60" rx="60" ry="16" fill={C.marigold700} {...S} />
    <ellipse cx="100" cy="62" rx={50 * water} ry={11 * water} fill={WATER} />
    <path d="M44 62 Q100 -10 156 62" fill="none" {...S} />
  </svg>
);

export const Drum: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <path d="M44 46 V166 Q100 186 156 166 V46" fill="#2f7fb5" {...S} />
    <path d="M44 86 Q100 100 156 86 M44 126 Q100 140 156 126" fill="none" {...S} />
    <ellipse cx="100" cy="46" rx="56" ry="16" fill="#1f5f8a" {...S} />
    <ellipse cx="100" cy="48" rx={46 * water} ry={10 * water} fill={WATER} />
  </svg>
);

export const FlowerTub: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <path d="M100 96 V40 M100 70 Q70 50 64 30 M100 60 Q130 44 140 24" stroke={C.neem} strokeWidth="8" fill="none" strokeLinecap="round" />
    <circle cx="64" cy="30" r="12" fill={C.blood} />
    <circle cx="140" cy="24" r="12" fill={C.marigold} />
    <path d="M56 96 L70 156 H130 L144 96 Z" fill="#c4663a" {...S} />
    <ellipse cx="100" cy="166" rx="66" ry="14" fill="#a34f2a" {...S} />
    <ellipse cx="100" cy="164" rx={54 * water} ry={8 * water} fill={WATER} />
  </svg>
);

export const AcTray: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <rect x="22" y="34" width="156" height="70" rx="14" fill={C.white} {...S} />
    <path d="M40 84 H160 M40 94 H160" fill="none" {...S} strokeWidth={5} />
    <path d="M100 110 Q96 124 100 132" stroke={WATER} strokeWidth="7" fill="none" strokeLinecap="round" />
    <path d="M44 146 H156 L148 172 H52 Z" fill={C.sky200} {...S} />
    <rect x="58" y={150} width="84" height={14 * water} rx="4" fill={WATER} />
  </svg>
);

export const Construction: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <path d="M30 176 V56 H124 V176" fill="#9aa3b5" {...S} />
    <path d="M30 96 H124 M30 136 H124 M62 56 V176 M94 56 V176" fill="none" {...S} strokeWidth={5} />
    <path d="M140 176 V20 M140 28 H186 M140 28 L112 56" fill="none" {...S} stroke={C.marigold700} />
    <ellipse cx="160" cy="180" rx={34 * water} ry={8 * water} fill={WATER} />
  </svg>
);

export const Drain: React.FC<P> = ({ size = 200, water = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200">
    <rect x="20" y="70" width="160" height="80" rx="10" fill="#6b7280" {...S} />
    <rect x="34" y="84" width="132" height="52" rx="6" fill="#4b5563" {...S} />
    <rect x="38" y={136 - 44 * water} width="124" height={44 * water} rx="4" fill={WATER} />
  </svg>
);

export const Mosquito: React.FC<{ size?: number; wing?: number; color?: string }> = ({ size = 160, wing = 0, color = C.ink }) => (
  <svg width={size} height={size} viewBox="0 0 160 160">
    <g stroke={color} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d="M70 92 L40 130 M78 96 L64 140 M90 96 L104 140 M98 92 L128 130 M74 86 L36 96 M94 86 L132 96" />
      <path d="M52 70 L18 54" strokeWidth="5" />
    </g>
    <ellipse cx="84" cy="56" rx={30} ry={14 + wing * 6} fill="rgba(200,225,255,0.65)" stroke={color} strokeWidth="3" transform={`rotate(${-30 - wing * 20} 84 70)`} />
    <ellipse cx="84" cy="88" rx="34" ry="12" fill={color} transform="rotate(14 84 88)" />
    {/* Aedes white stripes */}
    <path d="M68 82 L64 94 M82 84 L78 96 M96 88 L92 98" stroke={C.white} strokeWidth="4" strokeLinecap="round" />
    <circle cx="54" cy="72" r="10" fill={color} />
  </svg>
);

export const Pin: React.FC<{ size?: number; color?: string }> = ({ size = 90, color = C.blood }) => (
  <svg width={size} height={size * 1.25} viewBox="0 0 80 100">
    <path d="M40 98 C40 98 8 60 8 38 A32 32 0 0 1 72 38 C72 60 40 98 40 98 Z" fill={color} stroke={C.inkDeep} strokeWidth="5" />
    <circle cx="40" cy="38" r="12" fill={C.white} />
  </svg>
);

export const Check: React.FC<{ size?: number; color?: string }> = ({ size = 60, color = C.white }) => (
  <svg width={size} height={size} viewBox="0 0 60 60">
    <path d="M14 31 L26 43 L47 18" stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
