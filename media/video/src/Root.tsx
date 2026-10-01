import { Composition, Folder } from "remotion";
import { CitizenVideo } from "./citizen/CitizenVideo";
import citizen from "./generated/citizen.json";
import govt from "./generated/govt.json";
import { GovtVideo } from "./govt/GovtVideo";
import { StoryVideo, storyFrames } from "./story/StoryVideo";
import { FPS, totalFrames, type Manifest } from "./timeline";

// Durations follow the narration: re-run media/voice/narrate.py and the timeline resizes itself.
export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="Launch">
      <Composition
        id="Citizen"
        component={CitizenVideo}
        durationInFrames={totalFrames(citizen as Manifest)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ siteUrl: "denguewatch.org.bd" }}
      />
      <Composition
        id="Govt"
        component={GovtVideo}
        durationInFrames={totalFrames(govt as Manifest)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ siteUrl: "denguewatch.org.bd", contact: "team@denguewatch.org.bd" }}
      />
      <Composition
        id="Story"
        component={StoryVideo}
        durationInFrames={storyFrames(FPS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ name: "আপনার নাম", role: "প্রতিষ্ঠাতা, ডেঙ্গুওয়াচ বিডি", siteUrl: "denguewatch.org.bd" }}
      />
    </Folder>
  );
};
