import type React from "react";
import { C, body, display, hardShadow } from "../theme";

export const Tag: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number }> = ({ children, bg = C.white, color = C.ink, size = 40 }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      padding: `${size * 0.32}px ${size * 0.7}px`,
      borderRadius: 999,
      background: bg,
      color,
      fontFamily: body,
      fontWeight: 700,
      fontSize: size,
      boxShadow: hardShadow(6),
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

export const Brand: React.FC<{ color?: string }> = ({ color = C.white }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: display, fontWeight: 800, fontSize: 46, color }}>
    <div style={{ width: 22, height: 22, borderRadius: 6, background: C.blood, boxShadow: hardShadow(4) }} />
    ডেঙ্গুওয়াচ বিডি
  </div>
);
