import { createContext, type ReactNode } from "react";
import type { BoardConnectionStyle } from "@shared/types";
import type {
  ConnectionLabelAnchor,
  ConnectionPoint,
  ConnectionRouteKind,
  ConnectionRoutingDraft,
  ConnectionSide
} from "./connection-interaction";
import type { ConnectionObstacle, ResolvedConnectionRoute } from "./connection-routing";

export interface CanvasConnectionAnchor {
  side: ConnectionSide;
  ratio: number;
  mode: "auto" | "pinned";
}

export interface CanvasConnectionBridge {
  id: string;
  point: ConnectionPoint;
  orientation: "horizontal" | "vertical";
  radius?: number;
}

export type CanvasConnectionSelectionCommand =
  | { type: "set-routing-kind"; kind: ConnectionRouteKind }
  | { type: "reset-routing" }
  | { type: "set-style"; style: Partial<BoardConnectionStyle> };

export interface CanvasConnectionEdgeData extends Record<string, unknown> {
  sourceAnchor?: number | Partial<CanvasConnectionAnchor>;
  targetAnchor?: number | Partial<CanvasConnectionAnchor>;
  label?: string;
  labelProgress?: number;
  labelAnchor?: ConnectionLabelAnchor;
  routeCoordinate?: number;
  routing?: Partial<ConnectionRoutingDraft>;
  style?: BoardConnectionStyle;
  lineJumps?: CanvasConnectionBridge[];
  resolvedRoute?: ResolvedConnectionRoute;
  obstacles?: ConnectionObstacle[];
  toolbarOwner?: boolean;
}

export interface CanvasConnectionEdgeDraft {
  sourceAnchor: CanvasConnectionAnchor;
  targetAnchor: CanvasConnectionAnchor;
  labelAnchor: ConnectionLabelAnchor;
  routing: ConnectionRoutingDraft;
}

export type CanvasConnectionTransactionKind =
  | "endpoint"
  | "label"
  | "segment"
  | "waypoint"
  | "routing-kind"
  | "reset-route";

export interface CanvasConnectionTransaction {
  edgeId: string;
  kind: CanvasConnectionTransactionKind;
  targetId?: string;
  before: CanvasConnectionEdgeDraft;
  after: CanvasConnectionEdgeDraft;
}

export interface CanvasConnectionEdgeActions {
  select: (edgeId: string, additive?: boolean) => void;
  begin: (transaction: CanvasConnectionTransaction) => void;
  change: (transaction: CanvasConnectionTransaction) => void;
  commit: (transaction: CanvasConnectionTransaction) => void;
  cancel: (transaction: CanvasConnectionTransaction) => void;
  startLabelEdit?: (edgeId: string, anchor: ConnectionLabelAnchor) => void;
  updateLabel?: (edgeId: string, label: string) => void;
  applyToSelection?: (originEdgeId: string, command: CanvasConnectionSelectionCommand) => void;
  editingEdgeId?: string | null;
}

const EMPTY_ACTIONS: CanvasConnectionEdgeActions = {
  select: () => undefined,
  begin: () => undefined,
  change: () => undefined,
  commit: () => undefined,
  cancel: () => undefined
};

export const CanvasConnectionEdgeActionsContext = createContext<CanvasConnectionEdgeActions>(EMPTY_ACTIONS);

export function CanvasConnectionEdgeActionsProvider({
  actions,
  children
}: {
  actions: CanvasConnectionEdgeActions;
  children: ReactNode;
}): React.ReactElement {
  return (
    <CanvasConnectionEdgeActionsContext.Provider value={actions}>
      {children}
    </CanvasConnectionEdgeActionsContext.Provider>
  );
}
