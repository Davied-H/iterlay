import type { BoardConnection } from "@shared/types";

export function createMissingGenerationOutputConnections(input: {
  sourceId: string;
  targetIds: readonly string[];
  existing: readonly BoardConnection[];
  label: string;
  idFactory?: () => string;
}): BoardConnection[] {
  const connectedTargets = new Set(input.existing
    .filter((connection) => connection.source === input.sourceId)
    .map((connection) => connection.target));
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());

  return [...new Set(input.targetIds)]
    .filter((targetId) => targetId && targetId !== input.sourceId && !connectedTargets.has(targetId))
    .map((targetId) => ({
      id: idFactory(),
      source: input.sourceId,
      target: targetId,
      sourceHandle: "system-output",
      targetHandle: "system-input",
      kind: "visual",
      label: input.label,
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    }));
}
