import { describe, expect, it, vi } from "vitest";
import {
  finishActiveSceneGeneration,
  getActiveSceneGenerations,
  startActiveSceneGeneration,
  subscribeActiveSceneGenerations
} from "../src/lib/active-scene-generation";

describe("active scene generation", () => {
  it("keeps a scene task available until the matching run finishes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveSceneGenerations(listener);
    const generation = startActiveSceneGeneration({
      id: "generation-1",
      sceneId: "scene-1",
      source: "creator",
      requestedCount: 3,
      startedAt: 1234
    });

    expect(getActiveSceneGenerations()["scene-1"]).toEqual(generation);
    expect(listener).toHaveBeenCalledTimes(1);

    finishActiveSceneGeneration("scene-1", "stale-generation");
    expect(getActiveSceneGenerations()["scene-1"]).toEqual(generation);
    expect(listener).toHaveBeenCalledTimes(1);

    finishActiveSceneGeneration("scene-1", generation.id);
    expect(getActiveSceneGenerations()["scene-1"]).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not let an older request clear a newer task for the same scene", () => {
    startActiveSceneGeneration({
      id: "older-generation",
      sceneId: "scene-2",
      source: "creator",
      requestedCount: 1,
      startedAt: 1000
    });
    const newer = startActiveSceneGeneration({
      id: "newer-generation",
      sceneId: "scene-2",
      source: "detail",
      requestedCount: 2,
      startedAt: 2000
    });

    finishActiveSceneGeneration("scene-2", "older-generation");
    expect(getActiveSceneGenerations()["scene-2"]).toEqual(newer);

    finishActiveSceneGeneration("scene-2", newer.id);
  });
});
