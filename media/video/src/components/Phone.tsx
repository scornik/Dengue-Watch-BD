import type React from "react";
import { C, hardShadow } from "../theme";

/** Simple phone frame; the screen content is drawn in code so it stays sharp at any size. */
export const Phone: React.FC<{ width: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ width, children, style }) => {
  const height = width * 2.05;
  const bezel = width * 0.045;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.13,
        background: C.inkDeep,
        padding: bezel,
        boxShadow: hardShadow(width * 0.04, "rgba(0,0,0,0.35)"),
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: width * 0.1,
          overflow: "hidden",
          position: "relative",
          background: C.sky,
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          top: bezel + width * 0.03,
          left: "50%",
          width: width * 0.26,
          height: width * 0.06,
          marginLeft: -width * 0.13,
          borderRadius: 999,
          background: C.inkDeep,
        }}
      />
    </div>
  );
};
