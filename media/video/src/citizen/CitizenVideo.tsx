import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type React from "react";
import manifest from "../generated/citizen.json";
import { NarratedVideo, type SceneDef } from "../NarratedVideo";
import type { Manifest } from "../timeline";
import { Cta, Hook, Hunter, Privacy, Report, Ward, Where } from "./scenes";

export type CitizenProps = { siteUrl: string };

export const CitizenVideo: React.FC<CitizenProps> = ({ siteUrl }) => {
  const W = 1080;
  const H = 1920;
  const scenes: SceneDef[] = [
    { id: "hook", Component: Hook, tone: "light", out: iris({ width: W, height: H }) },
    { id: "where", Component: Where, tone: "dark", out: slide({ direction: "from-bottom" }) },
    { id: "report", Component: Report, tone: "dark", out: wipe({ direction: "from-top-left" }) },
    { id: "privacy", Component: Privacy, tone: "light", out: pushCut({ flashColor: "#ffffff", flashOpacity: 0.55 }) },
    { id: "ward", Component: Ward, tone: "dark", out: slide({ direction: "from-right" }) },
    { id: "hunter", Component: Hunter, tone: "light", out: clockWipe({ width: W, height: H }) },
    { id: "cta", Component: (p) => <Cta {...p} siteUrl={siteUrl} />, tone: "light" },
  ];
  return <NarratedVideo manifest={manifest as Manifest} scenes={scenes} layout="vertical" />;
};
