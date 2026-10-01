import { clockWipe } from "@remotion/transitions/clock-wipe";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type React from "react";
import bn from "../generated/govt.json";
import en from "../generated/en/govt.json";
import { NarratedVideo, type SceneDef } from "../NarratedVideo";
import type { Manifest } from "../timeline";
import { Cta, Data, Digest, Hook, Join, LEFT_CAPTIONS, MapScene, Scorecard } from "./scenes";

export type GovtProps = { siteUrl: string; contact: string; lang: "bn" | "en" };

export const GovtVideo: React.FC<GovtProps> = ({ siteUrl, contact, lang }) => {
  const W = 1920;
  const H = 1080;
  const scenes: SceneDef[] = [
    { id: "hook", Component: Hook, tone: "light", captionArea: LEFT_CAPTIONS, out: wipe({ direction: "from-left" }) },
    { id: "data", Component: Data, tone: "dark", captionArea: LEFT_CAPTIONS, out: slide({ direction: "from-right" }) },
    { id: "map", Component: MapScene, tone: "light", captionArea: LEFT_CAPTIONS, out: slide({ direction: "from-right" }) },
    { id: "scorecard", Component: Scorecard, tone: "dark", captionArea: LEFT_CAPTIONS, out: pushCut({ flashColor: "#ffffff", flashOpacity: 0.55 }) },
    { id: "join", Component: Join, tone: "light", captionArea: LEFT_CAPTIONS, out: slide({ direction: "from-right" }) },
    { id: "digest", Component: Digest, tone: "dark", captionArea: LEFT_CAPTIONS, out: clockWipe({ width: W, height: H }) },
    { id: "cta", Component: (p) => <Cta {...p} siteUrl={siteUrl} contact={contact} />, tone: "light" },
  ];
  return <NarratedVideo manifest={(lang === "en" ? en : bn) as Manifest} scenes={scenes} layout="landscape" music="music/govt.mp3" musicVolume={0.24} />;
};
