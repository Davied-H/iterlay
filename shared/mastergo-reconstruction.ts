export type MasterGoConnectionState =
  | {
      status: "disconnected";
      reason: "mastergo-not-open" | "canvas-offline" | "local-service-unavailable" | "adapter-unavailable";
      message: string;
    }
  | {
      status: "connected";
      endpoint: string;
      adapterVersion: string;
      target: {
        id: "current-page";
        name: string;
        description: string;
        documentName?: string;
        documentId?: string;
      };
    };

export interface PrepareMasterGoReconstructionRequest {
  sourceName: string;
  frameName: string;
  mode: MasterGoReconstructionMode;
  width?: number;
  height?: number;
}

export type MasterGoReconstructionMode = "ui" | "photo-layers";

export interface MasterGoReconstructionPreparation {
  id: string;
  target: "current-page";
  targetName: string;
  mode: "free-draw";
  modeName: string;
  modeDescription: string;
}

export interface MasterGoReconstructionRequest {
  preparationId: string;
  sourcePath: string;
  sourceName: string;
  width?: number;
  height?: number;
  frameName: string;
  target: "current-page";
  strategy: "fidelity" | "balanced";
  mode: MasterGoReconstructionMode;
  evolutionEnabled?: boolean;
}

export type MasterGoReconstructionStage =
  | "queued"
  | "preparing"
  | "planning"
  | "analyzing"
  | "building"
  | "submitting"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

export interface MasterGoReconstructionTask {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  stage: MasterGoReconstructionStage;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  result?: {
    frameName: string;
    targetName: string;
    htmlLength: number;
    mode: MasterGoReconstructionMode;
    targetNodeId?: string;
    html?: string;
    canvas?: { width: number; height: number };
    layers?: Array<{
      id: string;
      name: string;
      path: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  };
  error?: string;
}
