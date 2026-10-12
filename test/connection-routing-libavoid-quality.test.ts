import { describe, expect, it, vi } from "vitest";

const captures = vi.hoisted(() => ({
  parameters: [] as Array<[number, number]>,
  options: [] as Array<[number, boolean]>,
  connectorStartYs: [] as number[]
}));

vi.mock("libavoid-js", () => {
  class Point {
    constructor(public x: number, public y: number) {}
    delete() {}
  }
  class ConnEnd {
    constructor(public point: Point) {}
    delete() {}
  }
  class ConnRef {
    constructor(router: Router, public source: ConnEnd, public target: ConnEnd) {
      void router;
      captures.connectorStartYs.push(source.point.y);
    }
    setRoutingType() {}
    setRoutingCheckpoints() {}
    displayRoute() {
      const points = [this.source.point, this.target.point];
      return { size: () => points.length, at: (index: number) => points[index] };
    }
  }
  class Router {
    constructor(flags: number) { void flags; }
    setRoutingParameter(parameter: { value: number }, value: number) {
      captures.parameters.push([parameter.value, value]);
    }
    setRoutingOption(option: { value: number }, value: boolean) {
      captures.options.push([option.value, value]);
    }
    processTransaction() {}
    deleteConnector() {}
    deleteShape() {}
    delete() {}
  }
  class Deletable {
    delete() {}
  }
  const enumValues = (names: string[], offset = 0) => Object.fromEntries(
    names.map((name, index) => [name, { value: index + offset }])
  );
  const runtime = {
    RouterFlag: { OrthogonalRouting: { value: 2 } },
    ConnType: { ConnType_Orthogonal: { value: 2 } },
    RoutingParameter: enumValues([
      "segmentPenalty",
      "crossingPenalty",
      "fixedSharedPathPenalty",
      "portDirectionPenalty",
      "shapeBufferDistance",
      "idealNudgingDistance",
      "reverseDirectionPenalty"
    ], 10),
    RoutingOption: enumValues([
      "nudgeOrthogonalSegmentsConnectedToShapes",
      "penaliseOrthogonalSharedPathsAtConnEnds",
      "nudgeOrthogonalTouchingColinearSegments",
      "performUnifyingNudgingPreprocessingStep",
      "nudgeSharedPathsWithCommonEndPoint"
    ], 30),
    Router,
    Point,
    ConnEnd,
    ConnRef,
    Rectangle: Deletable,
    ShapeRef: Deletable,
    Checkpoint: Deletable,
    CheckpointVector: class extends Deletable { push_back() {} }
  };
  return { AvoidLib: { load: vi.fn(async () => {}), getInstance: () => runtime } };
});

describe("libavoid multi-connection quality profile", () => {
  it("configures supported crossing, shared-path, port and nudging controls", async () => {
    const { routeConnectionsWithLibavoid } = await import(
      "@/components/canvas/connection-routing-libavoid"
    );
    const results = await routeConnectionsWithLibavoid([
      {
        id: "zeta",
        request: { source: { x: 0, y: 20 }, target: { x: 100, y: 20 }, obstacles: [], strict: true }
      },
      {
        id: "alpha",
        request: { source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, obstacles: [], strict: true }
      }
    ]);

    expect(captures.parameters).toEqual(expect.arrayContaining([
      [10, 50],
      [11, 200],
      [12, 110],
      [13, 100],
      [16, 50]
    ]));
    expect(captures.options).toEqual([
      [30, true],
      [31, true],
      [32, false],
      [33, true],
      [34, true]
    ]);
    expect(captures.connectorStartYs).toEqual([0, 20]);
    expect(results.map(({ id }) => id)).toEqual(["zeta", "alpha"]);
  });
});
