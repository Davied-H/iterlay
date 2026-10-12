import type { Edge, Node } from "@xyflow/react";
import { resolveGeneratedImageVersion, type GeneratedImage } from "./image-node-model";
import { getCanvasNodeDefinition } from "./NodeRegistry";

const MAX_REFERENCE_IMAGES = 4;

interface ReferenceEdgeData extends Record<string, unknown> {
  kind?: "visual" | "reference";
  versionBinding?: { mode: "follow-active" } | { mode: "pinned"; versionId: string };
}

type EdgeWithKind = Edge & { kind?: "visual" | "reference" };

export interface ResolvedGenerationNodeInput {
  prompt: string;
  images: GeneratedImage[];
  /** Upstream nodes that contributed text or an included, unique image. */
  sourceNodeIds: string[];
  versionConflicts?: string[];
}

/**
 * Resolve the reusable inputs for a generation node from its transitive
 * reference graph. Edge and node array order make the result deterministic.
 */
export function resolveGenerationNodeInput(
  generationNodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[]
): ResolvedGenerationNodeInput {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, Edge[]>();

  for (const edge of edges) {
    if (!isReferenceEdge(edge)) continue;
    const incoming = incomingByTarget.get(edge.target);
    if (incoming) incoming.push(edge);
    else incomingByTarget.set(edge.target, [edge]);
  }

  const textParts: string[] = [];
  const images: GeneratedImage[] = [];
  const sourceNodeIds: string[] = [];
  const versionConflicts: string[] = [];
  const visited = new Set<string>([generationNodeId]);
  const imageKeys = new Set<string>();

  const visit = (nodeId: string, viaEdge?: Edge): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const edge of incomingByTarget.get(nodeId) ?? []) visit(edge.source, edge);

    const node = nodeById.get(nodeId);
    if (!node) return;

    const resource = getCanvasNodeDefinition(node.type).resource(node);
    if (!resource) return;
    if (resource.type === "generation") {
      const output = resolveGenerationOutput(node, nodeById, edges, viaEdge, versionConflicts);
      if (!output) return;
      const key = output.path.trim() || output.dataUrl.trim() || output.id;
      if (imageKeys.has(key)) return;
      imageKeys.add(key);
      images.push(output);
      sourceNodeIds.push(output.id);
      return;
    }
    if (resource.type === "comic-setting" || resource.type === "comic-character" || resource.type === "comic-segment-script") {
      const value = comicDramaPrompt(resource.value, (viaEdge?.data as ReferenceEdgeData | undefined)?.versionBinding);
      if (value) textParts.push(value);
      sourceNodeIds.push(node.id);
      return;
    }
    if (resource.type === "text") {
      const text = resource.value.trim();
      if (!text) return;
      textParts.push(text);
      sourceNodeIds.push(node.id);
      return;
    }

    if (resource.type !== "image" || images.length >= MAX_REFERENCE_IMAGES) return;
    const image = resource.value;
    if (!isGeneratedImageResource(image) || image.pending || (!image.path.trim() && !image.dataUrl.trim())) return;

    const binding = (viaEdge?.data as ReferenceEdgeData | undefined)?.versionBinding;
    const selected = resolveGeneratedImageVersion(image, binding?.mode === "pinned" ? binding.versionId : undefined);
    if (!selected.image) {
      if (selected.conflict) versionConflicts.push(`${node.id}: ${selected.conflict}`);
      return;
    }
    const resolvedImage = selected.image;
    const key = resolvedImage.path.trim() || resolvedImage.dataUrl.trim() || resolvedImage.id;
    if (imageKeys.has(key)) return;
    imageKeys.add(key);
    images.push(resolvedImage);
    sourceNodeIds.push(node.id);
  };

  for (const edge of incomingByTarget.get(generationNodeId) ?? []) visit(edge.source, edge);

  const ownPrompt = readString(nodeById.get(generationNodeId)?.data, "prompt").trim();
  return {
    prompt: [ownPrompt, ...textParts].filter(Boolean).join("\n\n"),
    images,
    sourceNodeIds,
    ...(versionConflicts.length > 0 ? { versionConflicts } : {})
  };
}

function resolveGenerationOutput(
  generation: Node,
  nodeById: ReadonlyMap<string, Node>,
  edges: readonly Edge[],
  viaEdge: Edge | undefined,
  versionConflicts: string[]
): GeneratedImage | undefined {
  const outputs = edges.flatMap((edge) => {
    if (edge.source !== generation.id || isReferenceEdge(edge)) return [];
    const target = nodeById.get(edge.target);
    if (!target || target.type !== "imageNode") return [];
    const resource = getCanvasNodeDefinition(target.type).resource(target);
    return resource?.type === "image" ? [resource.value] : [];
  });
  const binding = (viaEdge?.data as ReferenceEdgeData | undefined)?.versionBinding;
  if (binding?.mode !== "pinned") return undefined;
  const matches = outputs.flatMap((image) => {
    const selected = resolveGeneratedImageVersion(image, binding.versionId);
    return selected.image ? [selected.image] : [];
  });
  if (matches.length !== 1) {
    versionConflicts.push(`${generation.id}: 固定版本 ${binding.versionId} 与实际生成媒体不一致。`);
    return undefined;
  }
  return matches[0];
}

function comicDramaPrompt(node: { activeVersionId: string; versions: Array<{ versionId: string; fields: unknown }> }, binding?: ReferenceEdgeData["versionBinding"]): string {
  const versionId = binding?.mode === "pinned" ? binding.versionId : node.activeVersionId;
  const version = node.versions.find((item) => item.versionId === versionId);
  if (!version?.fields || typeof version.fields !== "object") return "";
  return Object.values(version.fields as Record<string, unknown>).flatMap((value) => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string")
      : typeof value === "string" || typeof value === "number" ? [String(value)] : []
  )).filter(Boolean).join("；");
}

function isReferenceEdge(edge: Edge): boolean {
  const data = edge.data as ReferenceEdgeData | undefined;
  return (edge as EdgeWithKind).kind === "reference" || data?.kind === "reference";
}

function readString(data: unknown, key: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isGeneratedImageResource(value: unknown): value is GeneratedImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<GeneratedImage>;
  return typeof image.id === "string"
    && typeof image.path === "string"
    && typeof image.dataUrl === "string"
    && typeof image.jobId === "string";
}
