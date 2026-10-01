import { Composition, Folder } from "remotion";
import { CitizenVideo } from "./citizen/CitizenVideo";
import citizenBn from "./generated/citizen.json";
import citizenEn from "./generated/en/citizen.json";
import govtEn from "./generated/en/govt.json";
import govtBn from "./generated/govt.json";
import { GovtVideo } from "./govt/GovtVideo";
import { StoryVideo, storyFrames } from "./story/StoryVideo";
import { FPS, totalFrames, type Manifest } from "./timeline";

// Durations follow the narration: re-run media/voice/narrate_en.py (English, Kokoro) or
// narrate.py (Bangla) and the timeline resizes itself.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="English">
        <Composition
          id="CitizenEN"
          component={CitizenVideo}
          durationInFrames={totalFrames(citizenEn as Manifest)}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={{ siteUrl: "dengue-watch-bd.vercel.app", lang: "en" as const }}
        />
        <Composition
          id="GovtEN"
          component={GovtVideo}
          durationInFrames={totalFrames(govtEn as Manifest)}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ siteUrl: "dengue-watch-bd.vercel.app", contact: "", lang: "en" as const }}
        />
        <Composition
          id="StoryEN"
          component={StoryVideo}
          durationInFrames={storyFrames(FPS, "en")}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={{ name: "", role: "ডেঙ্গুওয়াচ বিডির নির্মাতা", siteUrl: "dengue-watch-bd.vercel.app", lang: "en" as const }}
        />
      </Folder>
      <Folder name="Bangla">
        <Composition
          id="Citizen"
          component={CitizenVideo}
          durationInFrames={totalFrames(citizenBn as Manifest)}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={{ siteUrl: "dengue-watch-bd.vercel.app", lang: "bn" as const }}
        />
        <Composition
          id="Govt"
          component={GovtVideo}
          durationInFrames={totalFrames(govtBn as Manifest)}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ siteUrl: "dengue-watch-bd.vercel.app", contact: "", lang: "bn" as const }}
        />
        <Composition
          id="Story"
          component={StoryVideo}
          durationInFrames={storyFrames(FPS, "bn")}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={{ name: "", role: "ডেঙ্গুওয়াচ বিডির নির্মাতা", siteUrl: "dengue-watch-bd.vercel.app", lang: "bn" as const }}
        />
      </Folder>
    </>
  );
};
