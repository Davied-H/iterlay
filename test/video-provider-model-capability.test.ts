import { describe, expect, it } from "vitest";
import type { VideoProviderCapability } from "../shared/types.js";
import {
  normalizeVideoProviderModelOption,
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
