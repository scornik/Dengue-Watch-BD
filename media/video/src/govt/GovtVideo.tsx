import { clockWipe } from "@remotion/transitions/clock-wipe";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type React from "react";
import manifest from "../generated/govt.json";
import { NarratedVideo, type SceneDef } from "../NarratedVideo";
import type { Manifest } from "../timeline";
import { Citizens, Cta, Hook, Open, Queue, Risk, Scorecard, Screening } from "./scenes";

export type GovtProps = { siteUrl: string; contact: string };

export const GovtVideo: React.FC<GovtProps> = ({ siteUrl, contact }) => {
  const W = 1920;
  const H = 1080;
  const scenes: SceneDef[] = [
    { id: "hook", Component: Hook, tone: "light", out: wipe({ direction: "from-left" }) },
    { id: "citizens", Component: Citizens, tone: "dark", out: slide({ direction: "from-right" }) },
    { id: "screening", Component: Screening, tone: "light", out: pushCut({ flashColor: "#ffffff", flashOpacity: 0.55 }) },
    { id: "queue", Component: Queue, tone: "dark", out: iris({ width: W, height: H }) },
    { id: "risk", Component: Risk, tone: "light", out: slide({ direction: "from-bottom" }) },
    { id: "scorecard", Component: Scorecard, tone: "dark", out: flip({ direction: "from-right" }) },
    { id: "open", Component: Open, tone: "light", out: clockWipe({ width: W, height: H }) },
    { id: "cta", Component: (p) => <Cta {...p} siteUrl={siteUrl} contact={contact} />, tone: "light" },
  ];
  return <NarratedVideo manifest={manifest as Manifest} scenes={scenes} layout="landscape" />;
};
