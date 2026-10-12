import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import {
  WELCOME_DEMO_DURATION,
  WELCOME_DEMO_FEATURE_FRAMES,
  WELCOME_DEMO_FEATURES_PER_SCENE,
  WELCOME_DEMO_FPS,
  WELCOME_DEMO_HEIGHT,
  WELCOME_MORE_DEMO_DURATION,
  WELCOME_MORE_DEMO_SCENE_COUNT,
  WELCOME_DEMO_SCENE_COUNT,
  WELCOME_DEMO_SCENE_STEP_FRAMES,
  WELCOME_DEMO_TRANSITION_FRAMES,
  WELCOME_DEMO_WIDTH,
  WelcomeDemoReel,
  type WelcomeDemoAssets,
  type WelcomeDemoMode
} from "./remotion/WelcomeDemoReel";

const baseUrl = import.meta.env.BASE_URL;
const assets: WelcomeDemoAssets = {
  assistantBefore: `${baseUrl}scene-previews/ecommerce/1.webp`,
  assistantAfter: `${baseUrl}scene-previews/ecommerce/3.webp`,
  parallelResults: [
    `${baseUrl}scene-previews/concept/1.webp`,
    `${baseUrl}scene-previews/concept/2.webp`,
    `${baseUrl}scene-previews/concept/3.webp`
  ],
  referenceSource: `${baseUrl}scene-previews/edit-style/2.webp`,
  referenceResult: `${baseUrl}scene-previews/edit-style/3.webp`,
  compareBefore: `${baseUrl}scene-previews/edit-bg/1.webp`,
  compareAfter: `${baseUrl}scene-previews/edit-bg/3.webp`,
  sliceSource: `${baseUrl}scene-previews/ad-poster/1.webp`
};

const NARRATION_SWITCH_OFFSET = Math.round(WELCOME_DEMO_TRANSITION_FRAMES * 0.75);

interface WelcomeDemoPlayerProps {
  mode: WelcomeDemoMode;
  onSceneChange: (scene: number) => void;
  onCueChange: (cue: number) => void;
  onComplete: () => void;
}

export interface WelcomeDemoPlayerHandle {
  seekToScene: (scene: number) => void;
}

const WelcomeDemoPlayer = forwardRef<WelcomeDemoPlayerHandle, WelcomeDemoPlayerProps>(function WelcomeDemoPlayer({
  mode,
  onSceneChange,
  onCueChange,
  onComplete
}, ref): React.ReactElement {
  const sceneCount = mode === "core" ? WELCOME_DEMO_SCENE_COUNT : WELCOME_MORE_DEMO_SCENE_COUNT;
  const durationInFrames = mode === "core" ? WELCOME_DEMO_DURATION : WELCOME_MORE_DEMO_DURATION;
  const playerRef = useRef<PlayerRef>(null);
  const onSceneChangeRef = useRef(onSceneChange);
  const onCueChangeRef = useRef(onCueChange);
  const onCompleteRef = useRef(onComplete);
  onSceneChangeRef.current = onSceneChange;
  onCueChangeRef.current = onCueChange;
  onCompleteRef.current = onComplete;

  useImperativeHandle(ref, () => ({
    seekToScene: (scene: number): void => {
      const nextScene = Math.min(sceneCount - 1, Math.max(0, scene));
      playerRef.current?.seekTo(nextScene * WELCOME_DEMO_SCENE_STEP_FRAMES + NARRATION_SWITCH_OFFSET);
      playerRef.current?.play();
    }
  }), [sceneCount]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    let currentFeature = -1;
    const handleFrame = ({ detail }: { detail: { frame: number } }): void => {
      const scene = Math.min(
        sceneCount - 1,
        Math.max(0, Math.floor((detail.frame - NARRATION_SWITCH_OFFSET) / WELCOME_DEMO_SCENE_STEP_FRAMES))
      );
      const localFrame = detail.frame - scene * WELCOME_DEMO_SCENE_STEP_FRAMES;
      const cue = Math.min(
        WELCOME_DEMO_FEATURES_PER_SCENE - 1,
        Math.max(0, Math.floor(localFrame / WELCOME_DEMO_FEATURE_FRAMES))
      );
      const nextFeature = scene * WELCOME_DEMO_FEATURES_PER_SCENE + cue;
      if (nextFeature === currentFeature) return;
      currentFeature = nextFeature;
      onSceneChangeRef.current(scene);
      onCueChangeRef.current(cue);
    };
    const handleEnded = (): void => onCompleteRef.current();
    player.addEventListener("frameupdate", handleFrame);
    player.addEventListener("ended", handleEnded);
    return () => {
      player.removeEventListener("frameupdate", handleFrame);
      player.removeEventListener("ended", handleEnded);
    };
  }, [sceneCount]);

  return (
    <Player
      ref={playerRef}
      component={WelcomeDemoReel}
      inputProps={{ assets, mode }}
      durationInFrames={durationInFrames}
      compositionWidth={WELCOME_DEMO_WIDTH}
      compositionHeight={WELCOME_DEMO_HEIGHT}
      fps={WELCOME_DEMO_FPS}
      autoPlay
      loop={false}
      moveToBeginningWhenEnded={false}
      initialFrame={0}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      initiallyMuted
      style={{ width: "100%", height: "100%" }}
    />
  );
});

export default WelcomeDemoPlayer;
