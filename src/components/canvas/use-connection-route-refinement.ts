import { useEffect, useRef, useState } from "react";
import { connectionEndpointLead } from "./connection-routing";
import {
  connectionRoutingWorkerCandidates,
  resolveConnectionWorkerRefinements
} from "./connection-route-projection";
import type {
  ConnectionRouteDescriptor,
  RefinedConnectionRoute
} from "./ConnectionController";
import type { ConnectionRoutingWorkerClient } from "./connection-routing-worker-client";

const ROUTING_REFINEMENT_DELAY_MS = 120;

export function useConnectionRouteRefinement(
  descriptors: readonly ConnectionRouteDescriptor[],
  suspended: boolean
): ReadonlyMap<string, RefinedConnectionRoute> {
  const [refinements, setRefinements] = useState<Map<string, RefinedConnectionRoute>>(() => new Map());
  const routingClientRef = useRef<ConnectionRoutingWorkerClient | null>(null);
  const activeSignaturesRef = useRef<ReadonlyMap<string, string>>(new Map());
  activeSignaturesRef.current = new Map(
    descriptors.map((descriptor) => [descriptor.edge.id, descriptor.signature])
  );

  useEffect(() => () => routingClientRef.current?.dispose(), []);

  useEffect(() => {
    if (suspended) return;
    const candidates = connectionRoutingWorkerCandidates(descriptors);
    if (candidates.length === 0) {
      setRefinements((current) => current.size === 0 ? current : new Map());
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void import("./connection-routing-worker-client").then(async ({ createConnectionRoutingWorkerClient }) => {
        if (controller.signal.aborted) return;
        const routingClient = routingClientRef.current ?? createConnectionRoutingWorkerClient();
        routingClientRef.current = routingClient;
        const workerResults = await routingClient.route(candidates.map((descriptor) => ({
          id: descriptor.edge.id,
          request: {
            source: connectionEndpointLead(descriptor.source, 16),
            target: connectionEndpointLead(descriptor.target, 16),
            obstacles: descriptor.endpointObstacles,
            padding: 12
          }
        })), controller.signal);
        if (controller.signal.aborted) return;
        const nextRefinements = resolveConnectionWorkerRefinements(
          candidates,
          workerResults,
          activeSignaturesRef.current
        );
        if (!controller.signal.aborted) setRefinements(nextRefinements);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn("连接线高质量避障初始化失败，已使用同步路由", error);
      });
    }, ROUTING_REFINEMENT_DELAY_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [descriptors, suspended]);

  return refinements;
}
