import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/ImageNode";
import {
  copyImageVersions,
  createDetachedVersionImage,
  extractImageVersion,
  separateImageVersions
} from "../src/components/canvas/image-versions";

const source: GeneratedImage = {
  id: "source-node",
  path: "/images/v2.png",
  dataUrl: "iterlay-asset://local/v2",
  jobId: "job-v2",
  source: "upload",
  activeVersion: 1,
  versions: [
    { path: "/images/v1.png", dataUrl: "iterlay-asset://local/v1", jobId: "job-v1", width: 640, height: 480 },
    { path: "/images/v2.png", dataUrl: "iterlay-asset://local/v2", jobId: "job-v2", width: 1024, height: 1024 }
  ]
};

describe("createDetachedVersionImage", () => {
  it("creates an independent image anchored beside the source node", () => {
    const detached = createDetachedVersionImage(source, 0, "detached-node", { x: 120, y: 340 });

    expect(detached).toMatchObject({
      id: "detached-node",
      path: "/images/v1.png",
      dataUrl: "iterlay-asset://local/v1",
      jobId: "job-v1",
      width: 640,
      height: 480,
      source: "upload",
      placementAnchorId: "source-node",
      placementPosition: { x: 120, y: 340 },
      preserveViewportOnCreate: true,
      selectOnCreate: true
    });
    expect(detached?.versions).toBeUndefined();
    expect(detached?.activeVersion).toBeUndefined();
  });

  it("returns null for an unavailable version", () => {
    expect(createDetachedVersionImage(source, 4, "detached-node")).toBeNull();
  });

  it("inherits the source dimensions for legacy versions without metadata", () => {
    const legacySource: GeneratedImage = {
      ...source,
      width: 941,
      height: 1672,
      versions: [
        { path: "/images/v1.png", dataUrl: "iterlay-asset://local/v1", jobId: "job-v1" },
        { path: "/images/v2.png", dataUrl: "iterlay-asset://local/v2", jobId: "job-v2" }
      ]
    };

    expect(createDetachedVersionImage(legacySource, 1, "detached-node")).toMatchObject({
      width: 941,
      height: 1672
    });
    expect(separateImageVersions(legacySource, () => "detached-node")?.every((image) =>
      image.width === 941 && image.height === 1672
    )).toBe(true);
  });
});

describe("separateImageVersions", () => {
  it("turns the complete stack into standalone images and keeps the active node id", () => {
    let nextId = 0;
    const separated = separateImageVersions(source, () => `new-node-${nextId += 1}`);

    expect(separated).toHaveLength(2);
    expect(separated?.map((image) => image.path)).toEqual(["/images/v1.png", "/images/v2.png"]);
    expect(separated?.[1].id).toBe("source-node");
    expect(separated?.[0]).toMatchObject({
      id: "new-node-1",
      placementAnchorId: "source-node",
      selectOnCreate: true
    });
    expect(separated?.every((image) => image.versions === undefined && image.activeVersion === undefined)).toBe(true);
  });

  it("ignores images without a multi-version stack", () => {
    expect(separateImageVersions({ ...source, versions: undefined }, () => "unused")).toBeNull();
  });

  it("places every separated version in one horizontal row", () => {
    let nextId = 0;
    const separated = separateImageVersions(source, () => `new-node-${nextId += 1}`, {
      position: { x: 80, y: 260 },
      previewIndex: 1
    });

    expect(separated?.map((image) => image.placementPosition)).toEqual([
      { x: -224, y: 260 },
      { x: 80, y: 260 }
    ]);
    expect(separated?.every((image) => image.preserveViewportOnCreate)).toBe(true);
  });
});

describe("copyImageVersions", () => {
  it("creates standalone copies without changing the source version stack", () => {
    let nextId = 0;
    const copies = copyImageVersions(source, () => `copy-${nextId += 1}`, {
      position: { x: 80, y: 260 },
      previewIndex: 1
    });

    expect(copies).toHaveLength(2);
    expect(copies?.map((image) => image.id)).toEqual(["copy-1", "copy-2"]);
    expect(copies?.every((image) => image.placementAnchorId === "source-node" && image.selectOnCreate)).toBe(true);
    expect(copies?.[0].placementPosition).toEqual({ x: -224, y: 260 });
    expect(copies?.[1]).toMatchObject({
      placementPosition: { x: 80, y: 260 },
      preserveViewportOnCreate: true
    });
    expect(copies?.every((image) => image.preserveViewportOnCreate)).toBe(true);
    expect(source.versions).toHaveLength(2);
  });
});

describe("extractImageVersion", () => {
  it("extracts one version and keeps the remaining stack on the source node", () => {
    const threeVersionSource: GeneratedImage = {
      ...source,
      activeVersion: 2,
      path: "/images/v3.png",
      dataUrl: "iterlay-asset://local/v3",
      jobId: "job-v3",
      versions: [
        ...(source.versions ?? []),
        { path: "/images/v3.png", dataUrl: "iterlay-asset://local/v3", jobId: "job-v3", width: 800, height: 600 }
      ]
    };

    const result = extractImageVersion(threeVersionSource, 1, "extracted-node", { x: -40, y: 480 });

    expect(result).toHaveLength(2);
    expect(result?.[0]).toMatchObject({
      id: "source-node",
      path: "/images/v3.png",
      activeVersion: 1
    });
    expect(result?.[0].versions?.map((version) => version.path)).toEqual(["/images/v1.png", "/images/v3.png"]);
    expect(result?.[1]).toMatchObject({
      id: "extracted-node",
      path: "/images/v2.png",
      placementAnchorId: "source-node",
      placementPosition: { x: -40, y: 480 },
      preserveViewportOnCreate: true,
      selectOnCreate: true
    });
  });

  it("turns the final remaining stack item into a standalone source image", () => {
    const result = extractImageVersion(source, 1, "extracted-node");

    expect(result?.[0]).toMatchObject({ id: "source-node", path: "/images/v1.png" });
    expect(result?.[0].versions).toBeUndefined();
    expect(result?.[0].activeVersion).toBeUndefined();
  });
});
