import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  mergeVideoReferences,
  resolveVideoGenerationPresentation,
  sameCanvasNodeSelection,
  videoReferenceFromPath
} from "@/components/canvas/CanvasBoard";

describe("canvas board video bindings", () => {
  it("reports canvas selection only when the selected ids change", () => {
    expect(sameCanvasNodeSelection([], [])).toBe(true);
    expect(sameCanvasNodeSelection(["setting", "character"], ["setting", "character"])).toBe(true);
    expect(sameCanvasNodeSelection(["setting"], ["character"])).toBe(false);
    expect(sameCanvasNodeSelection(["setting", "character"], ["character", "setting"])).toBe(false);
  });

  it("resolves an upstream video node only through the semantic video reference port", () => {
    const videoNode: Node = {
      id: "video-source",
      type: "videoNode",
      position: { x: 0, y: 0 },
      data: {
        video: {
          id: "video-source",
          title: "产品运镜",
          path: "/assets/source.mp4",
          dataUrl: "media:source",
          posterDataUrl: "media:poster",
          durationMs: 8_000
        }
      }
    };
    const generationNode: Node = {
      id: "generation",
      type: "videoGenerationNode",
      position: { x: 400, y: 0 },
      data: { prompt: "继续镜头" }
    };
    const edges: Edge[] = [
      {
        id: "video-reference",
        source: videoNode.id,
        target: generationNode.id,
        targetHandle: "target-video-reference",
        data: { kind: "reference" }
      }
    ];

    expect(resolveVideoGenerationPresentation(generationNode.id, [videoNode, generationNode], edges)).toMatchObject({
      sourceNodeIds: ["video-source"],
      referenceVideos: [{
        id: "video-source",
        name: "产品运镜",
        path: "/assets/source.mp4",
        dataUrl: "media:source",
        durationMs: 8_000
      }]
    });
  });

  it("resolves adopted generation outputs into named comic frame handles", () => {
    const firstGeneration: Node = { id: "first-generation", type: "generationNode", position: { x: 0, y: 0 }, data: { lastGenerationId: "first-job" } };
    const lastGeneration: Node = { id: "last-generation", type: "generationNode", position: { x: 0, y: 200 }, data: { lastGenerationId: "last-job" } };
    const firstImage: Node = { id: "first-image", type: "imageNode", position: { x: 200, y: 0 }, data: { image: { id: "first-image", path: "/first.png", dataUrl: "image:first", jobId: "first-job" } } };
    const lastImage: Node = { id: "last-image", type: "imageNode", position: { x: 200, y: 200 }, data: { image: { id: "last-image", path: "/last.png", dataUrl: "image:last", jobId: "last-job" } } };
    const segment: Node = { id: "segment", type: "comicSegmentNode", position: { x: 0, y: 0 }, data: {} };
    const video: Node = { id: "video-generation", type: "videoGenerationNode", position: { x: 400, y: 0 }, data: {} };
    const edges: Edge[] = [
      { id: "first-output", source: firstGeneration.id, target: firstImage.id, data: { kind: "visual" } },
      { id: "last-output", source: lastGeneration.id, target: lastImage.id, data: { kind: "visual" } },
      { id: "first-frame", source: firstGeneration.id, target: video.id, targetHandle: "target-start-frame", data: { kind: "reference", versionBinding: { mode: "pinned", versionId: "first-job" } } },
      { id: "last-frame", source: lastGeneration.id, target: video.id, targetHandle: "target-end-frame", data: { kind: "reference", versionBinding: { mode: "pinned", versionId: "last-job" } } },
      { id: "context", source: segment.id, target: video.id, targetHandle: "target-reference", data: { kind: "reference" } }
    ];
    expect(resolveVideoGenerationPresentation(video.id, [firstGeneration, lastGeneration, firstImage, lastImage, segment, video], edges)).toMatchObject({
      startFrame: { id: "first-image" }, endFrame: { id: "last-image" }, requiresFirstLastFrame: true
    });
    const ordinaryReference = edges.map((edge) => edge.id === "first-frame" ? { ...edge, data: { kind: "reference" } } : edge);
    expect(resolveVideoGenerationPresentation(video.id, [firstGeneration, lastGeneration, firstImage, lastImage, segment, video], ordinaryReference).startFrame).toBeUndefined();
  });

  it("shows a directly connected uploaded image in a semantic frame slot", () => {
    const uploadedImage: Node = {
      id: "uploaded-image",
      type: "imageNode",
      position: { x: 0, y: 0 },
      data: {
        image: {
          id: "uploaded-image",
          path: "/managed/uploaded.png",
          dataUrl: "asset://uploaded.png",
          jobId: "upload-job"
        }
      }
    };
    const video: Node = {
      id: "video-generation",
      type: "videoGenerationNode",
      position: { x: 400, y: 0 },
      data: {}
    };
    const edge: Edge = {
      id: "start-frame",
      source: uploadedImage.id,
      target: video.id,
      targetHandle: "target-start-frame",
      data: { kind: "reference", versionBinding: { mode: "follow-active" } }
    };

    expect(resolveVideoGenerationPresentation(video.id, [uploadedImage, video], [edge])).toMatchObject({
      startFrame: { id: "uploaded-image", dataUrl: "asset://uploaded.png" }
    });
  });

  it("maps persisted paths to media URLs and deduplicates them behind connected inputs", () => {
    const connected = {
      id: "connected",
      name: "已连接视频",
      path: "/assets/source.mp4",
      dataUrl: "media:connected"
    };
    const persisted = videoReferenceFromPath("/assets/source.mp4", 0, {
      "/assets/source.mp4": "media:persisted"
    });
    const second = videoReferenceFromPath("C:\\assets\\second.mp4", 1, {
      "C:\\assets\\second.mp4": "media:second"
    });

    expect(second.name).toBe("second.mp4");
    expect(mergeVideoReferences([connected], [persisted, second])).toEqual([
      connected,
      expect.objectContaining({ path: "C:\\assets\\second.mp4", dataUrl: "media:second" })
    ]);
  });

  it("keeps all semantic image references so the video node can report provider overflow", () => {
    const generationNode: Node = {
      id: "generation",
      type: "videoGenerationNode",
      position: { x: 400, y: 0 },
      data: { prompt: "多参考" }
    };
    const references: Node[] = Array.from({ length: 10 }, (_, index) => ({
      id: `reference-${index}`,
      type: "imageNode",
      position: { x: 0, y: index * 20 },
      data: { image: { id: `reference-${index}`, path: `/reference-${index}.png`, dataUrl: `image:${index}`, jobId: `job-${index}` } }
    }));
    const edges: Edge[] = references.map((reference) => ({
      id: `edge-${reference.id}`,
      source: reference.id,
      target: generationNode.id,
      targetHandle: "target-reference"
    }));

    expect(resolveVideoGenerationPresentation(
      generationNode.id,
      [...references, generationNode],
      edges
    ).referenceImages).toHaveLength(10);
  });
});
