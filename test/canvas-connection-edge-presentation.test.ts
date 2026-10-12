import { describe, expect, it } from "vitest";

import {
  connectionDashPattern,
  connectionEndMarker,
  connectionEdgeStoreSlicesEqual,
  connectionEdgeViewportMode,
  connectionMarkerSize,
  connectionRouteMatchesAnchors,
  connectionRoutesShareTopology,
  isGenerationResultConnection,
  resolveDraggedEndpointCoordinate,
  selectConnectionRouteRefinement,
  selectConnectionEdgeStore
} from "@/components/canvas/CanvasConnectionEdge";
import type { ReactFlowState } from "@xyflow/react";
import {
  CONNECTION_ENDPOINT_GAP_PX,
  insetConnectionRoute,
  offsetConnectionEndpoint,
  resolveConnectionRoutePoints
} from "@/components/canvas/connection-routing";
import { screenPxToFlow } from "@/components/canvas/canvas-coordinates";

const routing = { mode: "auto", kind: "orthogonal", waypoints: [] } as const;

describe("connection edge route presentation", () => {
  it("prioritizes the centered anchor while an endpoint is dragged", () => {
    const input = { base: 100, size: 200, gridSize: 8, centerSnapDistance: 10, bypassSnap: false };

    expect(resolveDraggedEndpointCoordinate({ ...input, raw: 191 })).toBe(200);
    expect(resolveDraggedEndpointCoordinate({ ...input, raw: 209 })).toBe(200);
    expect(resolveDraggedEndpointCoordinate({ ...input, raw: 218 })).toBe(216);
    expect(resolveDraggedEndpointCoordinate({ ...input, raw: 209, bypassSnap: true })).toBe(209);
  });

  it("reserves directional motion for generation result edges", () => {
    expect(isGenerationResultConnection("visual", "生成结果", "generationNode")).toBe(true);
    expect(isGenerationResultConnection("reference", "生成结果", "generationNode")).toBe(false);
    expect(isGenerationResultConnection("visual", "参考", "generationNode")).toBe(false);
    expect(isGenerationResultConnection("visual", "生成结果", "imageNode")).toBe(false);
  });

  it("always points generation result connections toward their output", () => {
    expect(connectionEndMarker(undefined, true)).toBe("arrow");
    expect(connectionEndMarker("none", true)).toBe("arrow");
    expect(connectionEndMarker("none", false)).toBe("none");
  });

  it("keeps visible route endpoints on their resolved node anchors", () => {
    const route = resolveConnectionRoutePoints([
      { x: 0, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 80 },
      { x: 100, y: 80 }
    ], routing);

    expect(route.points[0]).toMatchObject({ x: 0, y: 20 });
    expect(route.points.at(-1)).toMatchObject({ x: 100, y: 80 });
    expect(route.points.slice(1, -1)).toMatchObject([
      { x: 40, y: 20 },
      { x: 40, y: 80 }
    ]);
  });

  it("derives a fixed screen-space card gap without moving resolved anchors", () => {
    const route = resolveConnectionRoutePoints([
      { x: 0, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 80 },
      { x: 100, y: 80 }
    ], routing);
    const inset = screenPxToFlow(CONNECTION_ENDPOINT_GAP_PX, 0.5);
    const visible = insetConnectionRoute(route, inset, inset);

    expect(route.points[0]).toMatchObject({ x: 0, y: 20 });
    expect(route.points.at(-1)).toMatchObject({ x: 100, y: 80 });
    expect(visible.points[0]).toMatchObject({ x: 20, y: 20 });
    expect(visible.points.at(-1)).toMatchObject({ x: 80, y: 80 });
  });

  it("offsets snapped preview endpoints away from each node side", () => {
    expect(offsetConnectionEndpoint({ x: 100, y: 50 }, "left", 6)).toEqual({ x: 94, y: 50 });
    expect(offsetConnectionEndpoint({ x: 100, y: 50 }, "right", 6)).toEqual({ x: 106, y: 50 });
    expect(offsetConnectionEndpoint({ x: 100, y: 50 }, "top", 6)).toEqual({ x: 100, y: 44 });
    expect(offsetConnectionEndpoint({ x: 100, y: 50 }, "bottom", 6)).toEqual({ x: 100, y: 56 });
  });

  it("clamps adjustable arrow sizes to the supported range", () => {
    expect(connectionMarkerSize(undefined)).toBe(10);
    expect(connectionMarkerSize(4)).toBe(6);
    expect(connectionMarkerSize(14)).toBe(14);
    expect(connectionMarkerSize(24)).toBe(20);
  });

  it("uses provided endpoints for auto anchors but keeps pinned anchors strict", () => {
    const provided = resolveConnectionRoutePoints([
      { x: 0, y: 24 },
      { x: 80, y: 24 }
    ], routing);

    expect(connectionRouteMatchesAnchors(
      provided,
      { x: 0, y: 50 },
      { x: 80, y: 50 },
      { side: "right", ratio: 0.5, mode: "auto" },
      { side: "left", ratio: 0.5, mode: "auto" }
    )).toBe(true);
    expect(connectionRouteMatchesAnchors(
      provided,
      { x: 0, y: 50 },
      { x: 80, y: 24 },
      { side: "right", ratio: 0.5, mode: "pinned" },
      { side: "left", ratio: 0.5, mode: "auto" }
    )).toBe(false);
  });

  it("does not let an auto anchor leave its fixed node-boundary axis", () => {
    const horizontalSideDrift = resolveConnectionRoutePoints([
      { x: 4, y: 24 },
      { x: 80, y: 24 }
    ], routing);
    const verticalSideDrift = resolveConnectionRoutePoints([
      { x: 24, y: 4 },
      { x: 24, y: 80 }
    ], routing);

    expect(connectionRouteMatchesAnchors(
      horizontalSideDrift,
      { x: 0, y: 50 },
      { x: 80, y: 50 },
      { side: "right", ratio: 0.5, mode: "auto" },
      { side: "left", ratio: 0.5, mode: "auto" }
    )).toBe(false);
    expect(connectionRouteMatchesAnchors(
      verticalSideDrift,
      { x: 50, y: 0 },
      { x: 50, y: 80 },
      { side: "bottom", ratio: 0.5, mode: "auto" },
      { side: "top", ratio: 0.5, mode: "auto" }
    )).toBe(false);
  });

  it("rejects a delayed route that changes obstacle-side topology", () => {
    const current = resolveConnectionRoutePoints([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: -30 },
      { x: 80, y: -30 },
      { x: 80, y: 0 },
      { x: 100, y: 0 }
    ], routing);
    const sameTopology = resolveConnectionRoutePoints([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: -40 },
      { x: 84, y: -40 },
      { x: 84, y: 0 },
      { x: 100, y: 0 }
    ], routing);
    const oppositeSide = resolveConnectionRoutePoints([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 40 },
      { x: 84, y: 40 },
      { x: 84, y: 0 },
      { x: 100, y: 0 }
    ], routing);

    expect(connectionRoutesShareTopology(current, sameTopology)).toBe(true);
    expect(connectionRoutesShareTopology(current, oppositeSide)).toBe(false);
    expect(selectConnectionRouteRefinement(current, sameTopology)).toBe(sameTopology);
    expect(selectConnectionRouteRefinement(current, oppositeSide)).toBe(current);
    expect(selectConnectionRouteRefinement(current, undefined)).toBe(current);
  });

  it("uses compact round-dot spacing while preserving the configured width", () => {
    expect(connectionDashPattern("dashed", 1.5)).toBe("5 4.5");
    expect(connectionDashPattern("dotted", 1.5)).toBe("0 4.5");
    expect(connectionDashPattern("dotted", 4)).toBe("0 7");
    expect(connectionDashPattern("solid", 4)).toBe("none");
  });

  it("subscribes a plain edge to zoom for a stable card gap but not pan or viewport size", () => {
    expect(connectionEdgeViewportMode({
      selected: false,
      hasLabel: false,
      editingLabel: false,
      hasMarker: false
    })).toBe("zoom");

    const nodeLookup = new Map();
    const before = selectConnectionEdgeStore({
      nodeLookup,
      transform: [0, 0, 1],
      width: 800,
      height: 600
    } as ReactFlowState, "source", "target", "zoom");
    const after = selectConnectionEdgeStore({
      nodeLookup,
      transform: [240, -120, 1],
      width: 1200,
      height: 900
    } as ReactFlowState, "source", "target", "zoom");

    expect(connectionEdgeStoreSlicesEqual(before, after)).toBe(true);
    const zoomed = selectConnectionEdgeStore({
      nodeLookup,
      transform: [240, -120, 2],
      width: 1200,
      height: 900
    } as ReactFlowState, "source", "target", "zoom");
    expect(connectionEdgeStoreSlicesEqual(before, zoomed)).toBe(false);
  });

  it("subscribes marker-only edges to zoom but not pan or viewport size", () => {
    expect(connectionEdgeViewportMode({
      selected: false,
      hasLabel: false,
      editingLabel: false,
      hasMarker: true
    })).toBe("zoom");

    const nodeLookup = new Map();
    const initialState = {
      nodeLookup,
      transform: [0, 0, 1],
      width: 800,
      height: 600
    } as ReactFlowState;
    const initial = selectConnectionEdgeStore(initialState, "source", "target", "zoom");
    const panned = selectConnectionEdgeStore({
      ...initialState,
      transform: [100, 200, 1],
      width: 1200,
      height: 900
    } as ReactFlowState, "source", "target", "zoom");
    const zoomed = selectConnectionEdgeStore({
      ...initialState,
      transform: [100, 200, 2]
    } as ReactFlowState, "source", "target", "zoom");

    expect(connectionEdgeStoreSlicesEqual(initial, panned)).toBe(true);
    expect(connectionEdgeStoreSlicesEqual(initial, zoomed)).toBe(false);
    expect(zoomed.zoom).toBe(2);
  });

  it("keeps full viewport subscription for selected and labelled overlays", () => {
    expect(connectionEdgeViewportMode({
      selected: true,
      hasLabel: false,
      editingLabel: false,
      hasMarker: false
    })).toBe("overlay");
    expect(connectionEdgeViewportMode({
      selected: false,
      hasLabel: true,
      editingLabel: false,
      hasMarker: false
    })).toBe("overlay");
    expect(connectionEdgeViewportMode({
      selected: false,
      hasLabel: false,
      editingLabel: true,
      hasMarker: false
    })).toBe("overlay");
  });
});
