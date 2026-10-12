import { createRoot } from "react-dom/client";
import { ReactFlow, ReactFlowProvider, type Node, type NodeTypes } from "@xyflow/react";
import type { VideoProviderConfig } from "@shared/types";
import { VideoGenerationNode, type VideoGenerationNodeData } from "@/components/canvas/VideoGenerationNode";
import previewImage from "@/assets/creative-direction-architecture.png";
import "@/styles.css";
import "@xyflow/react/dist/style.css";

const previewParams = new URLSearchParams(window.location.search);
const advancedVideoModesEnabled = previewParams.get("advanced") === "1";
const previewStatus = previewParams.get("status") === "completed" ? "completed" : "ready";

const provider: VideoProviderConfig = {
  id: "ark-video",
  name: "火山方舟",
  type: "ark",
  baseUrl: "https://ark.example",
  model: "doubao-seedance-2-0-pro"
};

const shared: Omit<VideoGenerationNodeData, "mode" | "prompt"> = {
  advancedVideoModesEnabled,
  providerId: provider.id,
  providerOptions: [provider],
  model: provider.model,
  duration: 5,
  aspectRatio: "16:9",
  resolution: "720p",
  generateAudio: false,
  status: previewStatus
};

const nodes: Node[] = [
  {
    id: "generate",
    type: "videoGenerationNode",
    position: { x: 40, y: 40 },
    data: {
      ...shared,
      title: "新建视频",
      mode: "generate",
      prompt: "建筑空间在晨光中缓慢显现，镜头平稳向前推进",
      startFrame: { id: "start", path: previewImage, dataUrl: previewImage, jobId: "preview" }
    } satisfies VideoGenerationNodeData
  },
  {
    id: "remix",
    type: "videoGenerationNode",
    position: { x: 420, y: 40 },
    data: {
      ...shared,
      title: "改编视频",
      mode: "remix",
      prompt: "保留镜头运动，将场景改成雨夜霓虹街道",
      sourceVideoPath: "/preview/source.mp4",
      referenceVideos: [{ id: "source-remix", name: "城市漫游.mp4", path: "/preview/source.mp4", durationMs: 8_000 }]
    } satisfies VideoGenerationNodeData
  },
  {
    id: "extend",
    type: "videoGenerationNode",
    position: { x: 800, y: 40 },
    data: {
      ...shared,
      title: "继续视频",
      mode: "extend",
      prompt: "人物走入车站，镜头继续从身后跟随",
      sourceVideoPath: "/preview/source.mp4",
      referenceVideos: [{ id: "source-extend", name: "城市漫游.mp4", path: "/preview/source.mp4", durationMs: 8_000 }]
    } satisfies VideoGenerationNodeData
  }
];

const nodeTypes: NodeTypes = { videoGenerationNode: VideoGenerationNode };
const previewMode = previewParams.get("mode");
const previewNodes = previewMode
  ? nodes
      .filter((node) => node.id === previewMode)
      .map((node) => ({ ...node, position: { x: 40, y: 40 } }))
  : nodes;

createRoot(document.getElementById("root")!).render(
  <main className="h-screen w-screen bg-muted">
    <ReactFlowProvider>
      <ReactFlow
        nodes={previewNodes}
        edges={[]}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.5}
        maxZoom={1}
        proOptions={{ hideAttribution: true }}
      />
    </ReactFlowProvider>
  </main>
);
