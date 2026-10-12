import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/image-node-model";
import {
  resolveVideoGenerationAspectRatio,
  resolveVideoGenerationImageInputs
} from "../src/components/canvas/video-generation-image-inputs";

function image(id: string, width?: number, height?: number): GeneratedImage {
  return { id, path: `/managed/${id}.png`, dataUrl: `data:${id}`, jobId: `job-${id}`, width, height };
}

describe("video generation image input mapping", () => {
  it("infers the nearest supported ratio from the first usable semantic image", () => {
    expect(resolveVideoGenerationAspectRatio(
      image("start-without-size"),
      image("portrait-end", 900, 1600),
      [image("square-reference", 1024, 1024)]
    )).toEqual({
      aspectRatio: "9:16",
      sourceKey: "portrait-end:900x1600"
    });
  });

  it("prefers the start frame and returns nothing without valid dimensions", () => {
    expect(resolveVideoGenerationAspectRatio(
      image("landscape-start", 1920, 1080),
      image("portrait-end", 1080, 1920),
      [image("square-reference", 1024, 1024)]
    )?.aspectRatio).toBe("16:9");
    expect(resolveVideoGenerationAspectRatio(
      image("invalid", 0, 1080),
      undefined,
      [image("unknown")]
    )).toBeUndefined();
  });

  it("promotes legacy official references to first and last frames", () => {
    expect(resolveVideoGenerationImageInputs(true, undefined, undefined, [image("one"), image("two")])).toEqual({
      referenceImagePaths: [],
      firstFramePath: "/managed/one.png",
      lastFramePath: "/managed/two.png"
    });
  });

  it("keeps explicit official frame roles ahead of generic references", () => {
    expect(resolveVideoGenerationImageInputs(true, image("start"), image("end"), [image("reference")])).toEqual({
      referenceImagePaths: [],
      firstFramePath: "/managed/start.png",
      lastFramePath: "/managed/end.png"
    });
  });

  it("preserves reference semantics for custom providers", () => {
    expect(resolveVideoGenerationImageInputs(false, image("start"), image("end"), [image("reference")])).toEqual({
      referenceImagePaths: ["/managed/reference.png"],
      firstFramePath: "/managed/start.png",
      lastFramePath: "/managed/end.png"
    });
  });
});
