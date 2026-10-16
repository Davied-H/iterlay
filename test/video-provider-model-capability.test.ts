import { describe, expect, it } from "vitest";
import type { VideoProviderCapability } from "../shared/types.js";
import {
  normalizeVideoProviderModelOption,
  validateVideoParameters,
  resolveVideoParameters,
  resolveVideoModelCapability,
  videoProviderModelOptionFromCapability
} from "../shared/video-provider-models.js";

const capability: VideoProviderCapability = {
  modes: ["image-to-video", "first-last-frame"],
  maxInputs: { images: 2, videos: 0, audios: 0 },
  supportsCancel: false,
  supportsProgress: false,
  supportsGeneratedAudio: true,
  supportsWatermarkControl: false,
  ratios: ["16:9"], resolutions: ["720p"],
  durationSeconds: { min: 1, max: 10, supportsAuto: false }
};

describe("video provider model capability", () => {
  it("derives supported and unsupported from the full capability", () => {
    const option = videoProviderModelOptionFromCapability("model", capability);
    expect(resolveVideoModelCapability(option, "first-last-frame")).toBe("supported");
    expect(resolveVideoModelCapability(option, "remix")).toBe("unsupported");
  });

  it("keeps legacy model entries unknown instead of guessing from the id", () => {
    expect(resolveVideoModelCapability({ id: "obvious-first-last-frame-model" }, "first-last-frame")).toBe("unknown");
  });

  it("accepts a trusted supportedModes compatibility field", () => {
    const option = normalizeVideoProviderModelOption({ id: "model", supportedModes: ["image-to-video"] });
    expect(resolveVideoModelCapability(option ?? undefined, "first-last-frame")).toBe("unsupported");
  });

  it("uses the full capability as authority when compatibility modes conflict", () => {
    const option = normalizeVideoProviderModelOption({
      id: "model",
      supportedModes: ["image-to-video"],
      capability
    });
    expect(option?.supportedModes).toEqual(["image-to-video", "first-last-frame"]);
    expect(resolveVideoModelCapability(option ?? undefined, "first-last-frame")).toBe("supported");
  });

  it("rejects malformed full capabilities", () => {
    expect(normalizeVideoProviderModelOption({ id: "model", capability: { modes: ["first-last-frame"] } })).toBeNull();
  });
});

describe("shared video parameter validation", () => {
  const option = {
    id: "new-vendor/new-unseen-model", requiresPrompt: true,
    supportedDurations: [4, 6, 8], supportedRatios: ["16:9", "9:16"],
    supportedResolutions: ["720p"], supportsGeneratedAudio: false,
    supportedFrameImages: ["first_frame"] as Array<"first_frame" | "last_frame">
  };
  it.each([
    [{ prompt: " " }, "视频描述"],
    [{ durationSeconds: 10 }, "时长"],
    [{ durationSeconds: Number.NaN }, "大于 0"],
    [{ aspectRatio: "1:1" }, "画幅"],
    [{ resolution: "480p" }, "清晰度"],
    [{ generateAudio: true }, "声音"],
    [{ lastFrame: true }, "尾帧"]
  ])("validates catalog constraints independently of model names: %j", (patch, message) => {
    expect(validateVideoParameters({ prompt: "让镜头移动", ...patch }, option)).toContain(message);
  });
  it("accepts valid settings and explicit prompt-optional models", () => {
    expect(validateVideoParameters({ prompt: "镜头移动", durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", firstFrame: true }, option)).toBeUndefined();
    expect(validateVideoParameters({ prompt: " ", firstFrame: true }, { ...option, requiresPrompt: false })).toBeUndefined();
  });
  it.each([undefined, { id: "vendor/model-a" }, { id: "another/arbitrary-model" }])("requires a description when prompt optionality is unknown: %j", (unknownOption) => {
    expect(resolveVideoParameters(unknownOption).requiresPrompt).toBe(true);
    expect(validateVideoParameters({ prompt: "", firstFrame: true }, unknownOption)).toContain("视频描述");
    expect(validateVideoParameters({ prompt: "移动", durationSeconds: 23, aspectRatio: "5:4" }, unknownOption)).toBeUndefined();
  });
  it("checks ranges, media limits and modes from full capabilities", () => {
    const full = { id: "range-model", capability };
    expect(validateVideoParameters({ prompt: "移动", durationSeconds: 11 }, full)).toContain("时长");
    expect(validateVideoParameters({ prompt: "移动", durationSeconds: "auto" }, full)).toContain("自动时长");
    expect(validateVideoParameters({ prompt: "移动", images: 3 }, full)).toContain("上限");
    expect(validateVideoParameters({ prompt: "移动", videos: 1 }, full)).toContain("上限");
    expect(validateVideoParameters({ prompt: "移动", audios: 1 }, full)).toContain("上限");
    expect(validateVideoParameters({ prompt: "移动", mode: "remix" }, full)).toContain("生成模式");
  });
  it("preserves explicit optionality and rejects malformed parameter metadata", () => {
    expect(normalizeVideoProviderModelOption({ ...option, requiresPrompt: false })?.requiresPrompt).toBe(false);
    const normalized = normalizeVideoProviderModelOption({ id: "malformed", supportedDurations: [NaN], supportedRatios: [3], supportedFrameImages: ["fake"] });
    expect(normalized).toEqual({ id: "malformed" });
  });
  it("uses explicit frame metadata for first-last-frame capability", () => {
    expect(resolveVideoModelCapability({ id: "new", supportedFrameImages: ["first_frame", "last_frame"] }, "first-last-frame")).toBe("supported");
    expect(resolveVideoModelCapability(option, "first-last-frame")).toBe("unsupported");
  });
});
