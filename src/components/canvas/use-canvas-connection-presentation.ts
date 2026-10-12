import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import { useStore, type Edge, type Node } from "@xyflow/react";
import { calculateConnectionLineJumps } from "./connection-line-jumps";
import {
  applyConnectionRouteRefinements,
  buildConnectionRouteDescriptors,
  migrateLegacyConnectionEdges,
  projectConnectionEdges
} from "./connection-route-projection";
import type { ConnectionRouteDescriptor } from "./ConnectionController";
import { useConnectionRouteRefinement } from "./use-connection-route-refinement";

interface UseCanvasConnectionPresentationOptions {
  nodes: readonly Node[];
  edges: Edge[];
  edgesRef: MutableRefObject<Edge[]>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  draggingNodeIds: ReadonlySet<string>;
  viewportMoving: boolean;
  scheduleCanvasReport: () => void;
}

interface CanvasConnectionPresentation {
  descriptors: readonly ConnectionRouteDescriptor[];
  renderedEdges: Edge[];
}

export function useCanvasConnectionPresentation({
  nodes,
  edges,
  edgesRef,
  setEdges,
  draggingNodeIds,
  viewportMoving,
  scheduleCanvasReport
}: UseCanvasConnectionPresentationOptions): CanvasConnectionPresentation {
  const exactZoom = useStore((state) => state.transform[2]);
  const settledZoomRef = useRef(exactZoom);
  const zoom = viewportMoving ? settledZoomRef.current : exactZoom;
  if (!viewportMoving) settledZoomRef.current = exactZoom;
  const interactionActive = draggingNodeIds.size > 0 || viewportMoving;
  const settledDescriptorsRef = useRef(new Map<string, ConnectionRouteDescriptor>());
  const settledLineJumpsRef = useRef<ReturnType<typeof calculateConnectionLineJumps>>(new Map());
  const descriptors = useMemo(() => buildConnectionRouteDescriptors({
    nodes,
    edges,
    zoom,
    draggingNodeIds,
    settledDescriptors: settledDescriptorsRef.current
  }), [draggingNodeIds, edges, nodes, zoom]);

  useEffect(() => {
    if (interactionActive) return;
    settledDescriptorsRef.current = new Map(
      descriptors.map((descriptor) => [descriptor.edge.id, descriptor])
    );
  }, [descriptors, interactionActive]);

  useEffect(() => {
    setEdges((current) => {
      const migration = migrateLegacyConnectionEdges(current, descriptors, nodes);
      if (!migration.changed) return current;
      edgesRef.current = migration.edges;
      scheduleCanvasReport();
      return migration.edges;
    });
  }, [descriptors, edgesRef, nodes, scheduleCanvasReport, setEdges]);

  const refinements = useConnectionRouteRefinement(descriptors, interactionActive);
  const activeDescriptors = useMemo(
    () => applyConnectionRouteRefinements(descriptors, refinements),
    [descriptors, refinements]
  );
  const lineJumps = useMemo(() => {
    if (interactionActive) return settledLineJumpsRef.current;
    const next = calculateConnectionLineJumps(activeDescriptors.map((descriptor) => ({
      id: descriptor.edge.id,
      route: descriptor.route,
      enabled: descriptor.data.style?.lineJumps === true
    })));
    settledLineJumpsRef.current = next;
    return next;
  }, [activeDescriptors, interactionActive]);
  const renderedEdgesRef = useRef<readonly Edge[]>([]);
  const renderedEdges = useMemo(() => {
    const projected = projectConnectionEdges({
      edges,
      descriptors: activeDescriptors,
      lineJumps,
      previousEdges: renderedEdgesRef.current
    });
    renderedEdgesRef.current = projected;
    return projected;
  }, [activeDescriptors, edges, lineJumps]);

  return { descriptors, renderedEdges };
}
