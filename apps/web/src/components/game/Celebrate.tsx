"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";

const PIECES = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), rot: (i * 47) % 360, gold: i % 2 === 0 };
});

/** One-shot confetti made of Aedes leg bands (purely decorative). */
export function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-16">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`burst-piece absolute h-2 w-4 rounded-sm ${p.gold ? "bg-marigold" : "bg-white"}`}
          style={{ "--bx": `${p.x}px`, "--by": `${p.y}px`, "--br": `${p.rot}deg` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up to `to` once (ease-out); jumps straight there with reduced motion. */
export function CountUp({ to, locale, ms = 900 }: { to: number; locale: string; ms?: number }) {
  const [v, setV] = useState(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{formatNumber(v, locale)}</>;
}

/** Short buzz on phones that support it: success should be felt, not only seen. */
export function hapticSuccess() {
  try {
    navigator.vibrate?.([18, 40, 70]);
  } catch {
    /* not supported */
  }
}
