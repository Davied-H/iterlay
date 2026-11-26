import type { Edge } from "@xyflow/react";
import { edgeFromConnection } from "./ConnectionController";
import type { GeneratedImage } from "./image-node-model";
import type { VideoImageRole } from "./video-generation-presentation";
import { VIDEO_IMAGE_ROLE_LABELS } from "./video-generation-presentation";

export function connectVideoImages(edges: Edge[], target: string, role: VideoImageRole, images: GeneratedImage[]): Edge[] {
  const targetHandle = `target-${role}`;
  const retained = role === "reference" ? edges : edges.filter((edge) => edge.target !== target || edge.targetHandle !== targetHandle);
  const additions = images.filter((image, index) => image.path && images.findIndex((candidate) => candidate.id === image.id) === index)
    .filter((image) => !retained.some((edge) => edge.source === image.id && edge.target === target && edge.targetHandle === targetHandle))
    .map((image) => edgeFromConnection({
      id: crypto.randomUUID(), source: image.id, target, sourceHandle: "source-right", targetHandle,
      kind: "reference", label: VIDEO_IMAGE_ROLE_LABELS[role],
      versionBinding: image.jobId ? { mode: "pinned", versionId: image.jobId } : { mode: "follow-active" },
      sourceAnchor: { side: "right", ratio: 0.5, mode: "auto" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "auto" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    }));
  return [...retained, ...additions];
}
