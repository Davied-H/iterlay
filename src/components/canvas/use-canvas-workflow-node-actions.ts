import { useCallback, useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { BoardGenerationNode, BoardTextNode } from "@shared/types";
import { edgeFromConnection } from "./ConnectionController";
import type { GenerationNodeConfig } from "./GenerationNode";
import { patchCanvasWorkflowNode } from "./canvas-node-projection";
import type { CanvasWorkflowNodeCapability } from "./use-canvas-node-bindings";
import {
  resolveGenerationNodeInput,
  type ResolvedGenerationNodeInput
} from "./canvas-workflow";
import type { GeneratedImage } from "./image-node-model";

type WorkflowNode = BoardTextNode | BoardGenerationNode;
type NodeUpdater = (current: readonly Node[]) => Node[];
type EdgeUpdater = (current: readonly Edge[]) => Edge[];

export interface CanvasWorkflowNodeActionsOptions {
  workflowNodes: readonly WorkflowNode[];
  getNodes: () => Node[];
  getEdges: () => Edge[];
  updateNodes: (updater: NodeUpdater) => void;
  updateEdges: (updater: EdgeUpdater) => void;
  onUpdate?: (id: string, patch: Partial<WorkflowNode>) => void;
  onRun?: (
    node: BoardGenerationNode,
    input: ResolvedGenerationNodeInput
  ) => Promise<GeneratedImage[]>;
  recordCanvasChange: () => void;
  reportCanvasChange: () => void;
  notifyError: (message: string) => void;
  createEdgeId?: () => string;
}

function defaultCreateEdgeId(): string {
  return crypto.randomUUID();
}

export function useCanvasWorkflowNodeActions({
  workflowNodes,
  getNodes,
  getEdges,
  updateNodes,
  updateEdges,
  onUpdate,
  onRun,
  recordCanvasChange,
  reportCanvasChange,
  notifyError,
  createEdgeId = defaultCreateEdgeId
}: CanvasWorkflowNodeActionsOptions): CanvasWorkflowNodeCapability {
  const updateWorkflowNodeProjection = useCallback((
    id: string,
    patch: object,
    height?: number
  ): Node[] => {
    const current = getNodes();
    const next = patchCanvasWorkflowNode(current, id, patch, height);
    if (next !== current) updateNodes(() => next);
    return next;
  }, [getNodes, updateNodes]);

  const onTextChange = useCallback((id: string, text: string): void => {
    updateWorkflowNodeProjection(id, { text });
    onUpdate?.(id, { text });
  }, [onUpdate, updateWorkflowNodeProjection]);

  const onTextHeightChange = useCallback((
    id: string,
    height: number,
    heightMode: "auto" | "manual"
  ): void => {
    const patch = { displayHeight: height, heightMode };
    updateWorkflowNodeProjection(id, patch, height);
    onUpdate?.(id, patch);
    reportCanvasChange();
  }, [onUpdate, reportCanvasChange, updateWorkflowNodeProjection]);

  const onGenerationChange = useCallback((
    id: string,
    patch: Partial<GenerationNodeConfig>
  ): void => {
    updateWorkflowNodeProjection(id, patch);
    onUpdate?.(id, patch);
  }, [onUpdate, updateWorkflowNodeProjection]);

  const onGenerationHeightChange = useCallback((
    id: string,
    height: number,
    heightMode: "auto" | "manual"
  ): void => {
    const patch = { displayHeight: height, heightMode };
    updateWorkflowNodeProjection(id, patch, height);
    onUpdate?.(id, patch);
    reportCanvasChange();
  }, [onUpdate, reportCanvasChange, updateWorkflowNodeProjection]);

  const onRunGeneration = useCallback(async (
    id: string,
    config: GenerationNodeConfig
  ): Promise<void> => {
    const source = workflowNodes.find(
      (candidate): candidate is BoardGenerationNode => candidate.id === id && candidate.type === "generation"
    );
    if (!source || !onRun) return;

    const projectedNodes = updateWorkflowNodeProjection(id, config);
    const input = resolveGenerationNodeInput(id, projectedNodes, getEdges());
    if (!input.prompt.trim()) {
      notifyError("请填写提示词，或连接一个有内容的文本节点。");
      return;
    }

    recordCanvasChange();
    const outputs = await onRun({ ...source, ...config }, input);
    if (outputs.length === 0) return;
    const sourceStillExists = getNodes().some(
      (node) => node.id === id && node.type === "generationNode"
    );
    if (!sourceStillExists) return;

    const currentEdges = getEdges();
    const connectedTargets = new Set(
      currentEdges.filter((edge) => edge.source === id).map((edge) => edge.target)
    );
    const additions = outputs.flatMap((image) => {
      if (connectedTargets.has(image.id)) return [];
      connectedTargets.add(image.id);
      return [edgeFromConnection({
        id: createEdgeId(),
        source: id,
        target: image.id,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        kind: "visual",
        label: "生成结果",
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      })];
    });
    if (additions.length === 0) return;
    updateEdges(() => [...currentEdges, ...additions]);
    reportCanvasChange();
  }, [
    createEdgeId,
    getEdges,
    getNodes,
    notifyError,
    onRun,
    recordCanvasChange,
    reportCanvasChange,
    updateEdges,
    updateWorkflowNodeProjection,
    workflowNodes
  ]);

  return useMemo(() => ({
    onBeforeChange: recordCanvasChange,
    onTextChange,
    onTextHeightChange,
    onGenerationChange,
    onRunGeneration,
    onGenerationHeightChange
  }), [
    onGenerationChange,
    onGenerationHeightChange,
    onRunGeneration,
    onTextChange,
    onTextHeightChange,
    recordCanvasChange
  ]);
}
