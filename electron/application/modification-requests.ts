import type { AssetStore } from "../storage/asset-store.js";
import type { BoardStore } from "../storage/board-store.js";
import { ModificationRequestStore } from "../storage/modification-request-store.js";
import { assertModificationInput, type CreateModificationRequest, type FinishModificationRequest, type ModificationRequest, type PreparedModificationRequest, type PublicModificationRequest } from "../../shared/modification-requests.js";
import { isBoardImageNode } from "../../shared/types.js";
import type { HistoryStore } from "../storage/history-store.js";

export class ModificationRequests {
  constructor(private readonly store: ModificationRequestStore, private readonly boards: BoardStore, private readonly assets: AssetStore, private readonly history: HistoryStore) {}
  private publicRequest(request: ModificationRequest): PublicModificationRequest {
    return { ...request, claim: request.claim ? { owner: request.claim.owner, claimedAt: request.claim.claimedAt } : undefined };
  }
  async list(boardId?: string): Promise<PublicModificationRequest[]> { return (await this.store.list(boardId)).map(request => this.publicRequest(request)); }
  async get(id: string): Promise<PublicModificationRequest> { return this.publicRequest(await this.store.get(id)); }
  private async verifySource(request: Pick<ModificationRequest,"boardId"|"nodeId"|"sourcePath"|"sourceVersionId">): Promise<void> {
    const board = await this.boards.getBoard(request.boardId);
    const node = board?.nodes.find(item => item.id === request.nodeId && isBoardImageNode(item));
    if (!node || !isBoardImageNode(node)) throw new Error("源图片已离开原画板，请先恢复图片，不能改用另一张图。");
    const versions = node.versions?.length ? node.versions : [{imagePath:node.imagePath,jobId:node.jobId}];
    if (versions.filter(v => v.imagePath === request.sourcePath && v.jobId === request.sourceVersionId).length !== 1
      || !await this.assets.isReadable(request.sourcePath)) throw new Error("请求固定的源版本已不可用，请重新确认目标。");
  }
  async create(input: CreateModificationRequest): Promise<PublicModificationRequest> {
    assertModificationInput(input); await this.verifySource(input);
    for (const reference of input.referencePaths ?? []) if (!await this.assets.isReadable(reference)) throw new Error("参考图片不可用。");
    const id = crypto.randomUUID();
    const pictures = [input.annotationDataUrl,input.maskDataUrl];
    const stored: Array<string | undefined> = [];
    for (let index=0;index<pictures.length;index++) {
      const dataUrl = pictures[index];
      if (!dataUrl) { stored.push(undefined); continue; }
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl);
      if (!match || match[2].length > 28_000_000) throw new Error("标注截图或蒙版无效，最大20MB。");
      const [saved] = await this.assets.saveReferenceImages([{id:id+"-"+index,name:index===0?"标注截图":"区域蒙版",mimeType:match[1],dataBase64:match[2]}]);
      stored.push(saved.path);
    }
    if (!stored.some(Boolean)) throw new Error("请先画出标注或区域，再保存修改请求。");
    const ready = Boolean(input.instruction.trim());
    const now = new Date().toISOString();
    return this.publicRequest(await this.store.add({schemaVersion:1,id,createdAt:now,updatedAt:now,status:ready?"ready":"needs-input",
      boardId:input.boardId,nodeId:input.nodeId,sourcePath:input.sourcePath,sourceVersionId:input.sourceVersionId,
      instruction:input.instruction.trim(),regions:structuredClone(input.regions),constraints:[...(input.constraints??[])],referencePaths:[...(input.referencePaths??[])],
      annotationPath:stored[0],maskPath:stored[1],clarification:ready?undefined:"请补充想修改什么、保留什么；请求尚未提交执行。"}));
  }
  async clarify(id: string,instruction: string): Promise<PublicModificationRequest> {
    if (typeof instruction !== "string" || !instruction.trim() || instruction.length>100_000) throw new Error("请填写明确的修改要求。");
    return this.publicRequest(await this.store.update(id,async current => {
      if (current.status === "claimed" || current.status === "succeeded") throw new Error("已接手或完成的请求不能修改。");
      await this.verifySource(current);
      return {...current,instruction:instruction.trim(),status:"ready",clarification:undefined,error:undefined,claim:undefined,execution:undefined};
    }));
  }
  async claim(id: string,owner: string): Promise<ModificationRequest> {
    if (typeof owner!=="string" || !owner.trim() || owner.length>200) throw new Error("请提供 Agent 接手者标识。");
    return this.store.update(id,async current => {
      if (current.status!=="ready") throw new Error(current.status==="needs-input"?"请求需要先澄清，不能执行。":"请求已被接手或尚不可执行。");
      await this.verifySource(current);
      return {...current,status:"claimed",claim:{owner:owner.trim(),token:crypto.randomUUID(),claimedAt:new Date().toISOString()}};
    });
  }
  async prepare(id: string, claimToken: string): Promise<PreparedModificationRequest> {
    const prepared = await this.store.update(id, async current => {
      if (current.status !== "claimed" || !claimToken || current.claim?.token !== claimToken) throw new Error("接手凭证无效，不能准备执行这条请求。");
      await this.verifySource(current);
      return { ...current, execution: current.execution ?? {
        key: `modification:${current.id}:${current.claim.claimedAt}`,
        preparedAt: new Date().toISOString()
      } };
    });
    return { ...this.publicRequest(prepared), executionKey: prepared.execution!.key };
  }
  async finish(input: FinishModificationRequest): Promise<PublicModificationRequest> {
    return this.publicRequest(await this.store.update(input.id,async current => {
      if (current.status!=="claimed" || !input.claimToken || current.claim?.token!==input.claimToken) throw new Error("接手凭证无效，不能更新这条请求。");
      if (input.error) return {...current,status:"failed",error:String(input.error).slice(0,10_000)};
      if (!Array.isArray(input.resultPaths) || !input.resultPaths.length || input.resultPaths.length>4 || !input.resultJobId) throw new Error("完成请求必须关联真实生成任务与结果。");
      const job = await this.history.getJob(input.resultJobId);
      const claimedAt = Date.parse(current.claim!.claimedAt);
      const createdAt = Date.parse(job?.createdAt ?? "");
      if (!job || job.status!=="succeeded" || job.boardId!==current.boardId || job.input.workflowMode!=="edit" || job.input.editSource?.imagePath!==current.sourcePath
        || job.input.modificationRequestId !== current.id || !Number.isFinite(createdAt) || !Number.isFinite(claimedAt) || createdAt < claimedAt
        || !current.execution || job.input.idempotencyKey !== current.execution.key
        || input.resultPaths.some(file=>!job.outputImagePaths.includes(file))) throw new Error("结果不属于这张画板上已完成的图片编辑任务。");
      for (const file of input.resultPaths) if (typeof file!=="string" || !await this.assets.isReadable(file)) throw new Error("生成结果不是可读取的受管图片。");
      await this.verifySource(current);
      const board = await this.boards.getBoard(current.boardId);
      const node = board?.nodes.find(item => item.id===current.nodeId);
      if (!node || !isBoardImageNode(node)) throw new Error("源节点不存在。");
      // edit_image already appends versions. Completing its request must not append twice.
      const known = new Set([node.imagePath,...(node.versions??[]).map(v=>v.imagePath)]);
      const missing = input.resultPaths.filter(file=>!known.has(file));
      if (missing.length) await this.boards.appendVersions(current.boardId,current.nodeId,missing.map(file=>({imagePath:file,jobId:input.resultJobId!})));
      return {...current,status:"succeeded",resultPaths:[...input.resultPaths],resultJobId:input.resultJobId,error:undefined};
    }));
  }
}
