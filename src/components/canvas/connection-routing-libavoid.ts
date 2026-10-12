import { AvoidLib } from "libavoid-js";
import bundledLibavoidWasmUrl from "/node_modules/libavoid-js/dist/libavoid.wasm?url";

import {
  resolveConnectionRoutePoints,
  routeConnectionAvoidingObstacles,
  type ConnectionObstacle,
  type ConnectionPoint,
  type ResolvedConnectionRoute
} from "./connection-routing";

interface Deletable {
  delete(): void;
}

interface EnumValue {
  readonly value: number;
}

interface AvoidPoint extends Deletable {
  x: number;
  y: number;
}

interface AvoidPolyline {
  size(): number;
  at(index: number): AvoidPoint;
}

interface AvoidRouter extends Deletable {
  processTransaction(): void;
  deleteConnector(connector: AvoidConnector): void;
  deleteShape(shape: AvoidShape): void;
  setRoutingParameter(parameter: EnumValue, value: number): void;
  setRoutingOption?(option: EnumValue, value: boolean): void;
}

interface AvoidConnector {
  displayRoute(): AvoidPolyline;
  setRoutingType(type: EnumValue): void;
  setRoutingCheckpoints(checkpoints: AvoidCheckpointVector): void;
}

type AvoidShape = object;

interface AvoidCheckpointVector extends Deletable {
  push_back(checkpoint: AvoidCheckpoint): void;
}

type AvoidCheckpoint = Deletable;

interface AvoidRuntime {
  RouterFlag: { OrthogonalRouting: EnumValue };
  ConnType: { ConnType_Orthogonal: EnumValue };
  RoutingParameter: {
    shapeBufferDistance: EnumValue;
    idealNudgingDistance: EnumValue;
    segmentPenalty?: EnumValue;
    crossingPenalty?: EnumValue;
    fixedSharedPathPenalty?: EnumValue;
    portDirectionPenalty?: EnumValue;
    reverseDirectionPenalty?: EnumValue;
  };
  RoutingOption?: {
    nudgeOrthogonalSegmentsConnectedToShapes?: EnumValue;
    penaliseOrthogonalSharedPathsAtConnEnds?: EnumValue;
    nudgeOrthogonalTouchingColinearSegments?: EnumValue;
    performUnifyingNudgingPreprocessingStep?: EnumValue;
    nudgeSharedPathsWithCommonEndPoint?: EnumValue;
  };
  Router: new (flags: number) => AvoidRouter;
  Point: new (x: number, y: number) => AvoidPoint;
  ConnEnd: new (point: AvoidPoint) => Deletable;
  ConnRef: new (router: AvoidRouter, source: Deletable, target: Deletable) => AvoidConnector;
  Rectangle: new (center: AvoidPoint, width: number, height: number) => Deletable;
  ShapeRef: new (router: AvoidRouter, rectangle: Deletable) => AvoidShape;
  Checkpoint: new (point: AvoidPoint) => AvoidCheckpoint;
  CheckpointVector: new () => AvoidCheckpointVector;
}

export interface LibavoidInitializationOptions {
  /** Vite/Electron 打包若无法自动定位同目录 WASM，应显式传入资源 URL。 */
  wasmUrl?: string;
}

export interface LibavoidRouteRequest {
  source: ConnectionPoint;
  target: ConnectionPoint;
  obstacles: ConnectionObstacle[];
  checkpoints?: ConnectionPoint[];
  padding?: number;
  bendPenalty?: number;
  /** 严格模式下初始化或路由失败会抛错；默认返回同步 fallback。 */
  strict?: boolean;
}

export interface LibavoidRouteResult {
  points: ConnectionPoint[];
  route: ResolvedConnectionRoute;
  engine: "libavoid" | "visibility-fallback";
  fallbackReason?: string;
}

export interface LibavoidBatchRouteRequest {
  id: string;
  request: LibavoidRouteRequest;
}

export interface LibavoidBatchRouteResult extends LibavoidRouteResult {
  id: string;
}

let initialization: Promise<AvoidRuntime> | undefined;
let initializationUrl: string | undefined;

function defaultWasmUrl(): string | undefined {
  // The Node build resolves its colocated WASM from disk. Renderer builds need Vite's
  // emitted asset URL; relying on the optimized dependency's import.meta.url serves HTML in dev.
  return typeof window === "undefined" && typeof self === "undefined" ? undefined : bundledLibavoidWasmUrl;
}

async function loadRuntime(wasmUrl: string | undefined): Promise<AvoidRuntime> {
  if ((typeof window === "undefined" && typeof self === "undefined") || !wasmUrl) {
    await AvoidLib.load(wasmUrl);
    return AvoidLib.getInstance() as AvoidRuntime;
  }

  // Emscripten aborts outside its returned promise when a fetch response is invalid. Validate
  // first and hand it a trusted blob URL so an offline/503 response can cleanly use our fallback.
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`libavoid WASM request failed with HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (!WebAssembly.validate(bytes)) throw new Error("libavoid WASM response is not a valid module");
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/wasm" }));
  try {
    await AvoidLib.load(objectUrl);
    return AvoidLib.getInstance() as AvoidRuntime;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function initializeLibavoid(
  options: LibavoidInitializationOptions = {}
): Promise<AvoidRuntime> {
  const wasmUrl = options.wasmUrl ?? defaultWasmUrl();
  if (!initialization) {
    initializationUrl = wasmUrl;
    initialization = loadRuntime(wasmUrl)
      .catch((error: unknown) => {
        initialization = undefined;
        initializationUrl = undefined;
        throw error;
      });
  } else if (wasmUrl !== initializationUrl) {
    console.warn("libavoid 已初始化，忽略后续不同的 WASM URL", {
      initializedWith: initializationUrl,
      ignored: wasmUrl
    });
  }
  return initialization;
}

function finitePoint(point: ConnectionPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function nonNegativeFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function configureRouterQuality(router: AvoidRouter, runtime: AvoidRuntime): void {
  const setParameter = (name: keyof AvoidRuntime["RoutingParameter"], value: number) => {
    const parameter = runtime.RoutingParameter[name];
    if (parameter) router.setRoutingParameter(parameter, value);
  };
  const setOption = (name: keyof NonNullable<AvoidRuntime["RoutingOption"]>, value: boolean) => {
    const option = runtime.RoutingOption?.[name];
    if (option && router.setRoutingOption) router.setRoutingOption(option, value);
  };

  // These are libavoid's own recommended values when each penalty is activated.
  setParameter("segmentPenalty", 50);
  setParameter("crossingPenalty", 200);
  setParameter("fixedSharedPathPenalty", 110);
  setParameter("portDirectionPenalty", 100);
  // Crossing penalties can otherwise favour a long route travelling away from its target.
  setParameter("reverseDirectionPenalty", 50);

  setOption("nudgeOrthogonalSegmentsConnectedToShapes", true);
  setOption("penaliseOrthogonalSharedPathsAtConnEnds", true);
  setOption("nudgeOrthogonalTouchingColinearSegments", false);
  setOption("performUnifyingNudgingPreprocessingStep", true);
  setOption("nudgeSharedPathsWithCommonEndPoint", true);
}

function stableEntryKey(entry: LibavoidBatchRouteRequest): string {
  const { source, target, checkpoints = [] } = entry.request;
  return JSON.stringify([
    entry.id,
    source.x,
    source.y,
    target.x,
    target.y,
    checkpoints.map(({ x, y }) => [x, y])
  ]);
}

function obstacleContainsPoint(obstacle: ConnectionObstacle, point: ConnectionPoint): boolean {
  const left = Math.min(obstacle.x, obstacle.x + obstacle.width);
  const right = Math.max(obstacle.x, obstacle.x + obstacle.width);
  const top = Math.min(obstacle.y, obstacle.y + obstacle.height);
  const bottom = Math.max(obstacle.y, obstacle.y + obstacle.height);
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function routeIntersectsObstacle(points: ConnectionPoint[], obstacle: ConnectionObstacle): boolean {
  const left = Math.min(obstacle.x, obstacle.x + obstacle.width);
  const right = Math.max(obstacle.x, obstacle.x + obstacle.width);
  const top = Math.min(obstacle.y, obstacle.y + obstacle.height);
  const bottom = Math.max(obstacle.y, obstacle.y + obstacle.height);
  return points.slice(0, -1).some((start, index) => {
    const end = points[index + 1];
    if (Math.abs(start.y - end.y) < 0.001) {
      return start.y > top + 0.001 && start.y < bottom - 0.001
        && Math.max(Math.min(start.x, end.x), left) < Math.min(Math.max(start.x, end.x), right) - 0.001;
    }
    if (Math.abs(start.x - end.x) < 0.001) {
      return start.x > left + 0.001 && start.x < right - 0.001
        && Math.max(Math.min(start.y, end.y), top) < Math.min(Math.max(start.y, end.y), bottom) - 0.001;
    }
    return true;
  });
}

function safeDelete(value: unknown): void {
  try {
    if (value && typeof (value as Partial<Deletable>).delete === "function") {
      (value as Deletable).delete();
    }
  } catch {
    // Router ownership differs between libavoid builds; cleanup is best-effort after transaction teardown.
  }
}

function collapse(points: ConnectionPoint[]): ConnectionPoint[] {
  const result: ConnectionPoint[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.x - point.x) < 0.001 && Math.abs(previous.y - point.y) < 0.001) continue;
    if (result.length > 1) {
      const before = result[result.length - 2];
      const horizontal = Math.abs(before.y - previous!.y) < 0.001 && Math.abs(previous!.y - point.y) < 0.001;
      const vertical = Math.abs(before.x - previous!.x) < 0.001 && Math.abs(previous!.x - point.x) < 0.001;
      const between = (value: number, start: number, end: number) =>
        value >= Math.min(start, end) - 0.001 && value <= Math.max(start, end) + 0.001;
      if ((horizontal && between(previous!.x, before.x, point.x))
        || (vertical && between(previous!.y, before.y, point.y))) {
        result.pop();
      }
    }
    result.push(point);
  }
  return result;
}

function orthogonalSegmentDirection(start: ConnectionPoint, end: ConnectionPoint): string | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) < 0.001) return `x:${dx < 0 ? "-" : "+"}`;
  if (Math.abs(dx) < 0.001) return `y:${dy < 0 ? "-" : "+"}`;
  return undefined;
}

/** A delayed refinement is safe to reveal only when it keeps the same bends and travel directions. */
export function orthogonalRouteTopologiesMatch(
  currentValues: ConnectionPoint[],
  refinementValues: ConnectionPoint[]
): boolean {
  const current = collapse(currentValues);
  const refinement = collapse(refinementValues);
  if (current.length !== refinement.length || current.length < 2) return false;
  return current.slice(0, -1).every((point, index) => {
    const currentDirection = orthogonalSegmentDirection(point, current[index + 1]);
    const refinementDirection = orthogonalSegmentDirection(refinement[index], refinement[index + 1]);
    return currentDirection !== undefined && currentDirection === refinementDirection;
  });
}

/**
 * High-quality async refinement. Call after a connection/node drag completes, never from pointermove.
 * The sync visibility-graph router is returned on initialization or native routing failure.
 */
export async function routeConnectionWithLibavoid(
  request: LibavoidRouteRequest,
  initializationOptions: LibavoidInitializationOptions = {}
): Promise<LibavoidRouteResult> {
  const [result] = await routeConnectionsWithLibavoid(
    [{ id: "route", request }],
    initializationOptions
  );
  return {
    points: result.points,
    route: result.route,
    engine: result.engine,
    fallbackReason: result.fallbackReason
  };
}

function fallbackRoute(request: LibavoidRouteRequest, reason: string): LibavoidRouteResult {
  const points = routeConnectionAvoidingObstacles(
    request.source,
    request.target,
    request.obstacles,
    { padding: request.padding, bendPenalty: request.bendPenalty }
  );
  return {
    points,
    route: resolveConnectionRoutePoints(points),
    engine: "visibility-fallback",
    fallbackReason: reason
  };
}

/** Runs every connector in one Router transaction so shapes and native setup are shared. */
export async function routeConnectionsWithLibavoid(
  entries: LibavoidBatchRouteRequest[],
  initializationOptions: LibavoidInitializationOptions = {}
): Promise<LibavoidBatchRouteResult[]> {
  if (entries.length === 0) return [];
  if (entries.some(({ request }) => request.strict
    && (!finitePoint(request.source) || !finitePoint(request.target)))) {
    throw new Error("libavoid endpoints must contain finite coordinates");
  }

  let runtime: AvoidRuntime;
  try {
    runtime = await initializeLibavoid(initializationOptions);
  } catch (error) {
    if (entries.some(({ request }) => request.strict)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return entries.map(({ id, request }) => ({ id, ...fallbackRoute(request, reason) }));
  }

  let router: AvoidRouter | undefined;
  const connectors: Array<{
    entry: LibavoidBatchRouteRequest;
    inputIndex: number;
    connector: AvoidConnector;
  }> = [];
  const shapes: AvoidShape[] = [];
  const owned: Deletable[] = [];
  try {
    router = new runtime.Router(runtime.RouterFlag.OrthogonalRouting.value);
    router.setRoutingParameter(
      runtime.RoutingParameter.shapeBufferDistance,
      Math.max(...entries.map(({ request }) => nonNegativeFinite(request.padding, 12)))
    );
    router.setRoutingParameter(runtime.RoutingParameter.idealNudgingDistance, 8);
    configureRouterQuality(router, runtime);

    const obstacleByKey = new Map<string, ConnectionObstacle>();
    for (const { request } of entries) {
      for (const obstacle of request.obstacles) {
        const key = `${obstacle.x}:${obstacle.y}:${obstacle.width}:${obstacle.height}`;
        if (!obstacleByKey.has(key)) obstacleByKey.set(key, obstacle);
      }
    }
    const sortedObstacles = [...obstacleByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, obstacle]) => obstacle);
    for (const obstacle of sortedObstacles) {
      if (![obstacle.x, obstacle.y, obstacle.width, obstacle.height].every(Number.isFinite)) continue;
      const width = Math.abs(obstacle.width);
      const height = Math.abs(obstacle.height);
      if (width < 0.001 || height < 0.001) continue;
      const right = obstacle.x + obstacle.width;
      const bottom = obstacle.y + obstacle.height;
      if (!Number.isFinite(right) || !Number.isFinite(bottom)) continue;
      const center = new runtime.Point(
        obstacle.x / 2 + right / 2,
        obstacle.y / 2 + bottom / 2
      );
      const rectangle = new runtime.Rectangle(center, width, height);
      owned.push(center, rectangle);
      shapes.push(new runtime.ShapeRef(router, rectangle));
    }

    const sortedEntries = entries
      .map((entry, inputIndex) => ({ entry, inputIndex, key: stableEntryKey(entry) }))
      .sort((left, right) => left.key.localeCompare(right.key) || left.inputIndex - right.inputIndex);
    for (const { entry, inputIndex } of sortedEntries) {
      const { request } = entry;
      if (!finitePoint(request.source) || !finitePoint(request.target)) continue;
      if (request.obstacles.some((obstacle) =>
        obstacleContainsPoint(obstacle, request.source) || obstacleContainsPoint(obstacle, request.target)
      )) continue;
      const sourcePoint = new runtime.Point(request.source.x, request.source.y);
      const targetPoint = new runtime.Point(request.target.x, request.target.y);
      const sourceEnd = new runtime.ConnEnd(sourcePoint);
      const targetEnd = new runtime.ConnEnd(targetPoint);
      owned.push(sourcePoint, targetPoint, sourceEnd, targetEnd);
      const connector = new runtime.ConnRef(router, sourceEnd, targetEnd);
      connector.setRoutingType(runtime.ConnType.ConnType_Orthogonal);
      connectors.push({ entry, inputIndex, connector });

      if (request.checkpoints?.length) {
        const vector = new runtime.CheckpointVector();
        owned.push(vector);
        for (const checkpoint of request.checkpoints) {
          if (!finitePoint(checkpoint)) continue;
          const point = new runtime.Point(checkpoint.x, checkpoint.y);
          const nativeCheckpoint = new runtime.Checkpoint(point);
          owned.push(point, nativeCheckpoint);
          vector.push_back(nativeCheckpoint);
        }
        connector.setRoutingCheckpoints(vector);
      }
    }

    router.processTransaction();
    const results: Array<LibavoidBatchRouteResult | undefined> = Array(entries.length);
    for (const { entry, inputIndex, connector } of connectors) {
      const polyline = connector.displayRoute();
      const points = Array.from({ length: polyline.size() }, (_, index) => {
        const point = polyline.at(index);
        return { x: point.x, y: point.y };
      }).filter(finitePoint);
      if (points.length < 2) {
        results[inputIndex] = { id: entry.id, ...fallbackRoute(entry.request, "libavoid returned an empty route") };
        continue;
      }
      const collapsed = collapse(points);
      const synchronous = routeConnectionAvoidingObstacles(
        entry.request.source,
        entry.request.target,
        entry.request.obstacles,
        { padding: entry.request.padding, bendPenalty: entry.request.bendPenalty }
      );
      const intersectsObstacle = entry.request.obstacles.some((obstacle) =>
        routeIntersectsObstacle(collapsed, obstacle)
      );
      results[inputIndex] = orthogonalRouteTopologiesMatch(synchronous, collapsed) && !intersectsObstacle
        ? { id: entry.id, points: collapsed, route: resolveConnectionRoutePoints(collapsed), engine: "libavoid" }
        : {
            id: entry.id,
            points: synchronous,
            route: resolveConnectionRoutePoints(synchronous),
            engine: "visibility-fallback",
            fallbackReason: "libavoid refinement changed route topology"
          };
    }
    return entries.map((entry, index) => results[index]
      ?? { id: entry.id, ...fallbackRoute(entry.request, "libavoid endpoints must contain finite coordinates") });
  } catch (error) {
    if (entries.some(({ request }) => request.strict)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return entries.map(({ id, request }) => ({ id, ...fallbackRoute(request, reason) }));
  } finally {
    if (router) {
      for (const { connector } of connectors) {
        try { router.deleteConnector(connector); } catch { /* already released */ }
      }
    }
    if (router) {
      for (const shape of shapes) {
        try { router.deleteShape(shape); } catch { /* router teardown releases it */ }
      }
    }
    for (const value of owned.reverse()) safeDelete(value);
    safeDelete(router);
  }
}
