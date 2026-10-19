/** A user-approved edit brief, independent of the currently selected canvas version. */
export interface ModificationRegion {
  kind: "rect" | "ellipse" | "arrow" | "brush" | "text";
  x: number; y: number; width: number; height: number;
  text?: string;
}
export interface AgentEditDraft {
  sourceVersionIndex: number;
  instruction: string;
  regions: ModificationRegion[];
  annotationDataUrl?: string;
  maskDataUrl?: string;
  constraints?: string[];
  referenceImages?: Array<{name:string;dataUrl:string}>;
}
export interface CreateModificationRequest {
  boardId: string;
  nodeId: string;
  sourcePath: string;
  sourceVersionId: string;
  instruction: string;
  regions: ModificationRegion[];
  annotationDataUrl?: string;
  maskDataUrl?: string;
  constraints?: string[];
  referencePaths?: string[];
}
export type ModificationStatus = "needs-input" | "ready" | "claimed" | "succeeded" | "failed";
export interface ModificationRequest {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ModificationStatus;
  boardId: string;
  nodeId: string;
  sourcePath: string;
  sourceVersionId: string;
  instruction: string;
  regions: ModificationRegion[];
  constraints: string[];
  referencePaths: string[];
  annotationPath?: string;
  maskPath?: string;
  clarification?: string;
  claim?: { owner: string; token: string; claimedAt: string };
  /** Durable execution identity. Every retry under this claim must reuse the same paid request key. */
  execution?: { key: string; preparedAt: string };
  resultPaths?: string[];
  resultJobId?: string;
  error?: string;
}
/** The claim capability is returned once by claim(), never by ordinary reads. */
export type PublicModificationRequest = Omit<ModificationRequest, "claim"> & {
  claim?: { owner: string; claimedAt: string };
};
export type PreparedModificationRequest = PublicModificationRequest & { executionKey: string };
export interface FinishModificationRequest {
  id: string;
  claimToken: string;
  resultJobId?: string;
  resultPaths?: string[];
  error?: string;
}

export function assertModificationInput(value: CreateModificationRequest): void {
  if (!value || ![value.boardId,value.nodeId,value.sourcePath,value.sourceVersionId].every(v => typeof v === "string" && v.length > 0 && v.length < 4096)
    || typeof value.instruction !== "string" || value.instruction.length > 100_000
    || !Array.isArray(value.regions) || value.regions.length > 1000) throw new Error("修改请求缺少明确的图片和源版本。");
  for (const region of value.regions) {
    if (!["rect","ellipse","arrow","brush","text"].includes(region.kind)
      || ![region.x,region.y,region.width,region.height].every(v => typeof v === "number" && Number.isFinite(v))
      || region.width < 0 || region.height < 0 || region.width > 10 || region.height > 10
      || Math.abs(region.x) > 10 || Math.abs(region.y) > 10
      || (region.text !== undefined && (typeof region.text !== "string" || region.text.length > 10_000))) throw new Error("标注区域必须使用相对原图坐标。");
  }
  for (const list of [value.constraints ?? [],value.referencePaths ?? []]) {
    if (!Array.isArray(list) || list.length > 20 || list.some(v => typeof v !== "string" || v.length > 4096)) throw new Error("修改请求的约束或参考图片无效。");
  }
}
