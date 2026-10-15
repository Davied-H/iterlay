import { translateSourceText } from "@/i18n/ui-text";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import type { Edge, Node } from "@xyflow/react";
import { toast } from "sonner";
import { applyConnectionDraft, applyConnectionSelectionCommand, selectConnectionEdges } from "./connection-edge-commands";
import type {
  CanvasConnectionEdgeActions,
  CanvasConnectionEdgeDraft,
  CanvasConnectionSelectionCommand,
  CanvasConnectionTransaction
} from "./canvas-connection-edge-contract";
import { connectionDraftsEqual, type PersistedCanvasConnectionEdgeData } from "./ConnectionController";
import { canvasSelectionSnapshot, type CanvasSelectionSnapshot } from "./canvas-history";

const CONNECTION_SELECTION_HINT_STORAGE_KEY = "iterlay:connection-selection-hint-seen";

interface UseCanvasConnectionEdgeActionsOptions {
  nodesRef: MutableRefObject<Node[]>;
  edgesRef: MutableRefObject<Edge[]>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  recordCanvasChange: () => void;
  scheduleCanvasReport: () => void;
  onBeforeCanvasChange?: (snapshot: CanvasSelectionSnapshot) => void;
}

interface ConnectionLabelEdit {
  edgeId: string;
  beforeData: PersistedCanvasConnectionEdgeData;
  snapshot: CanvasSelectionSnapshot;
}

export interface CanvasConnectionEdgeActionController {
  actions: CanvasConnectionEdgeActions;
  hasActiveTransaction: () => boolean;
}

export function useCanvasConnectionEdgeActions({
  nodesRef,
  edgesRef,
  setEdges,
  recordCanvasChange,
  scheduleCanvasReport,
  onBeforeCanvasChange
}: UseCanvasConnectionEdgeActionsOptions): CanvasConnectionEdgeActionController {
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const transactionSnapshotRef = useRef<CanvasSelectionSnapshot | null>(null);
  const labelEditRef = useRef<ConnectionLabelEdit | null>(null);
  const onBeforeCanvasChangeRef = useRef(onBeforeCanvasChange);
  onBeforeCanvasChangeRef.current = onBeforeCanvasChange;

  const select = useCallback((id: string, additive = false): void => {
    const newlySelected = !edgesRef.current.some((edge) => edge.id === id && edge.selected);
    setEdges((current) => {
      const result = selectConnectionEdges(current, id, additive);
      if (!result.changed) return current;
      edgesRef.current = result.edges;
      return result.edges;
    });
    if (!newlySelected) return;
    try {
      if (localStorage.getItem(CONNECTION_SELECTION_HINT_STORAGE_KEY)) return;
      localStorage.setItem(CONNECTION_SELECTION_HINT_STORAGE_KEY, "1");
      toast.info(translateSourceText("已选中连接线"), { description: translateSourceText("按 Delete 或 Backspace 删除") });
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }
  }, [edgesRef, setEdges]);

  const setDraft = useCallback((
    transaction: CanvasConnectionTransaction,
    draft: CanvasConnectionEdgeDraft,
    persist: boolean
  ): void => {
    setEdges((current) => {
      const result = applyConnectionDraft(current, transaction, draft);
      if (!result.changed) return current;
      edgesRef.current = result.edges;
      if (persist) scheduleCanvasReport();
      return result.edges;
    });
  }, [edgesRef, scheduleCanvasReport, setEdges]);

  const begin = useCallback((): void => {
    if (transactionSnapshotRef.current) return;
    transactionSnapshotRef.current = canvasSelectionSnapshot(nodesRef.current, edgesRef.current);
  }, [edgesRef, nodesRef]);
  const change = useCallback((transaction: CanvasConnectionTransaction): void => {
    setDraft(transaction, transaction.after, false);
  }, [setDraft]);
  const commit = useCallback((transaction: CanvasConnectionTransaction): void => {
    const snapshot = transactionSnapshotRef.current;
    transactionSnapshotRef.current = null;
    const changed = !connectionDraftsEqual(transaction.before, transaction.after);
    if (snapshot && changed) onBeforeCanvasChangeRef.current?.(snapshot);
    setDraft(transaction, transaction.after, changed);
  }, [setDraft]);
  const cancel = useCallback((transaction: CanvasConnectionTransaction): void => {
    transactionSnapshotRef.current = null;
    setDraft(transaction, transaction.before, false);
  }, [setDraft]);

  const startLabelEdit = useCallback((
    id: string,
    anchor: { segmentId?: string; progress: number }
  ): void => {
    const edge = edgesRef.current.find((candidate) => candidate.id === id);
    if (!edge) return;
    labelEditRef.current = {
      edgeId: id,
      beforeData: structuredClone((edge.data ?? {}) as PersistedCanvasConnectionEdgeData),
      snapshot: canvasSelectionSnapshot(nodesRef.current, edgesRef.current)
    };
    setEdges((current) => {
      const next = current.map((candidate) => candidate.id === id
        ? {
            ...candidate,
            data: {
              ...(candidate.data as PersistedCanvasConnectionEdgeData | undefined),
              labelAnchor: { ...anchor },
              labelProgress: undefined,
              labelPosition: undefined
            }
          }
        : candidate
      );
      edgesRef.current = next;
      return next;
    });
    setEditingEdgeId(id);
  }, [edgesRef, nodesRef, setEdges]);

  const updateLabel = useCallback((id: string, label: string): void => {
    const edit = labelEditRef.current?.edgeId === id ? labelEditRef.current : null;
    labelEditRef.current = null;
    setEditingEdgeId((current) => current === id ? null : current);
    const changed = (edit?.beforeData.label ?? "") !== label;
    if (changed) {
      if (edit) onBeforeCanvasChangeRef.current?.(edit.snapshot);
      else recordCanvasChange();
    }
    setEdges((current) => {
      const next = current.map((edge) => edge.id === id
        ? {
            ...edge,
            data: changed
              ? { ...(edge.data as PersistedCanvasConnectionEdgeData | undefined), label }
              : edit?.beforeData ?? edge.data
          }
        : edge
      );
      edgesRef.current = next;
      if (changed) scheduleCanvasReport();
      return next;
    });
  }, [edgesRef, recordCanvasChange, scheduleCanvasReport, setEdges]);

  const applyToSelection = useCallback((
    originEdgeId: string,
    command: CanvasConnectionSelectionCommand
  ): void => {
    const preview = applyConnectionSelectionCommand(edgesRef.current, originEdgeId, command);
    if (!preview.changed) return;
    recordCanvasChange();
    setEdges((current) => {
      const result = applyConnectionSelectionCommand(current, originEdgeId, command);
      if (!result.changed) return current;
      edgesRef.current = result.edges;
      scheduleCanvasReport();
      return result.edges;
    });
  }, [edgesRef, recordCanvasChange, scheduleCanvasReport, setEdges]);

  const hasActiveTransaction = useCallback((): boolean => transactionSnapshotRef.current !== null, []);
  const actions = useMemo<CanvasConnectionEdgeActions>(() => ({
    select,
    begin,
    change,
    commit,
    cancel,
    startLabelEdit,
    updateLabel,
    applyToSelection,
    editingEdgeId
  }), [applyToSelection, begin, cancel, change, commit, editingEdgeId, select, startLabelEdit, updateLabel]);

  return { actions, hasActiveTransaction };
}
