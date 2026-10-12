import { describe, expect, it } from "vitest";
import type { BoardNodeSnapshot } from "../shared/types";
import type { GeneratedImage } from "../src/components/canvas/image-node-model";
import {
  hydrateBoardNodeImageLayout,
  hydrateGeneratedImage,
  serializeGeneratedImage
} from "../src/lib/board-node-image";

function snapshot(overrides: Partial<BoardNodeSnapshot> = {}): BoardNodeSnapshot {
  return {
    type: "image",
    id: "image-1",
    imagePath: "/images/v2.png",
    jobId: "job-2",
    source: "generated",
    x: 120,
    y: 240,
    width: 1600,
    height: 900,
    displayWidth: 480,
    displayHeight: 270,
    versions: [
      { imagePath: "/images/v1.png", jobId: "job-1", width: 800, height: 800 },
      { imagePath: "/images/v2.png", jobId: "job-2", width: 1600, height: 900 }
    ],
    activeVersion: 1,
    ...overrides
  };
}

describe("board node image hydration", () => {
  it("maps persisted paths to data URLs and keeps image metadata", () => {
    const image = hydrateGeneratedImage(snapshot(), {
      "/images/v1.png": "asset://v1",
      "/images/v2.png": "asset://v2"
    });

    expect(image).toMatchObject({
      id: "image-1",
      path: "/images/v2.png",
      dataUrl: "asset://v2",
      jobId: "job-2",
      width: 1600,
      height: 900,
      activeVersion: 1,
      versions: [
        { path: "/images/v1.png", dataUrl: "asset://v1", jobId: "job-1" },
        { path: "/images/v2.png", dataUrl: "asset://v2", jobId: "job-2" }
      ]
    });
  });

  it("filters missing versions and degrades a single remaining version", () => {
    const image = hydrateGeneratedImage(snapshot(), { "/images/v2.png": "asset://v2" });

    expect(image).toMatchObject({ path: "/images/v2.png", dataUrl: "asset://v2" });
    expect(image?.versions).toBeUndefined();
    expect(image?.activeVersion).toBeUndefined();
  });

  it("does not hydrate a node whose active image is missing", () => {
    expect(hydrateGeneratedImage(snapshot(), { "/images/v1.png": "asset://v1" })).toBeNull();
  });

  it("resolves an out-of-range activeVersion from the current image path", () => {
    const image = hydrateGeneratedImage(snapshot({ activeVersion: 99 }), {
      "/images/v1.png": "asset://v1",
      "/images/v2.png": "asset://v2"
    });

    expect(image?.activeVersion).toBe(1);
  });

  it("degrades to no version chain when the current path is outside it", () => {
    const image = hydrateGeneratedImage(snapshot({
      imagePath: "/images/current.png",
      activeVersion: -1
    }), {
      "/images/current.png": "asset://current",
      "/images/v1.png": "asset://v1",
      "/images/v2.png": "asset://v2"
    });

    expect(image?.versions).toBeUndefined();
    expect(image?.activeVersion).toBeUndefined();
  });

  it("degrades empty and single-item persisted chains", () => {
    const imageUrls = { "/images/v2.png": "asset://v2" };

    for (const versions of [[], [{ imagePath: "/images/v2.png", jobId: "job-2" }]]) {
      const image = hydrateGeneratedImage(snapshot({ versions }), imageUrls);

      expect(image?.versions).toBeUndefined();
      expect(image?.activeVersion).toBeUndefined();
    }
  });

  it("round-trips normalized image metadata, width, and derivation idempotently", () => {
    const image: GeneratedImage = {
      id: "image-1",
      path: "/images/v2.png",
      dataUrl: "asset://v2",
      jobId: "job-2",
      source: "upload",
      width: 1600,
      height: 900,
      derivation: {
        sourceNodeId: "source-1",
        sourceImagePath: "/images/source.png",
        crop: { x: 10, y: 20, width: 300, height: 400 }
      },
      versions: [
        { path: "/images/v1.png", dataUrl: "asset://v1", jobId: "job-1", width: 800, height: 800 },
        { path: "/images/v2.png", dataUrl: "asset://v2", jobId: "job-2", width: 1600, height: 900 }
      ],
      activeVersion: 99
    };
    const layout = { x: 120, y: 240, width: 480, height: 270 };

    const node = serializeGeneratedImage(image, layout);

    expect(node).toEqual(snapshot({
      source: "upload",
      displayHeight: undefined,
      derivation: image.derivation
    }));
    expect(node.activeVersion).toBe(1);
    expect(hydrateBoardNodeImageLayout(node)).toEqual({ x: 120, y: 240, width: 480 });

    const hydrated = hydrateGeneratedImage(node, {
      "/images/v1.png": "asset://v1",
      "/images/v2.png": "asset://v2"
    });
    expect(hydrated).not.toBeNull();
    expect(serializeGeneratedImage(hydrated!, hydrateBoardNodeImageLayout(node))).toEqual(node);
  });

  it("normalizes empty, single-item, and contradictory in-memory chains", () => {
    const baseImage: GeneratedImage = {
      id: "image-1",
      path: "/images/current.png",
      dataUrl: "asset://current",
      jobId: "job-current",
      source: "generated"
    };
    const layout = { x: 10, y: 20, width: 300, height: 999 };
    const chains: GeneratedImage["versions"][] = [
      [],
      [{ path: "/images/current.png", dataUrl: "asset://current", jobId: "job-current" }],
      [
        { path: "/images/v1.png", dataUrl: "asset://v1", jobId: "job-1" },
        { path: "/images/v2.png", dataUrl: "asset://v2", jobId: "job-2" }
      ]
    ];

    for (const versions of chains) {
      const node = serializeGeneratedImage({ ...baseImage, versions, activeVersion: 0 }, layout);

      expect(node.versions).toBeUndefined();
      expect(node.activeVersion).toBeUndefined();
      expect(node.displayHeight).toBeUndefined();
    }
  });
});
