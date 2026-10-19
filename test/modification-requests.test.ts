import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModificationRequests } from "../electron/application/modification-requests.js";
import { ModificationRequestStore } from "../electron/storage/modification-request-store.js";
import { AssetStore } from "../electron/storage/asset-store.js";
import { BoardStore } from "../electron/storage/board-store.js";
import { HistoryStore } from "../electron/storage/history-store.js";
import type { CreateModificationRequest } from "../shared/modification-requests.js";
import type { GenerationJob } from "../shared/types.js";

const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=";
describe("persistent Agent edit requests",()=>{
  let dir:string,boards:BoardStore,assets:AssetStore,history:HistoryStore,service:ModificationRequests,input:CreateModificationRequest;
  beforeEach(async()=>{
    dir=await mkdtemp(path.join(os.tmpdir(),"iterlay-edit-brief-"));
    boards=new BoardStore(dir);assets=new AssetStore(dir);history=new HistoryStore(dir);
    const [source]=await assets.saveOutputs("source",[{bytes:Buffer.from(png,"base64"),mimeType:"image/png"}]);
    const board=await boards.createBoard("brief");
    await boards.appendNodes(board.id,[{id:"speaker",imagePath:source,jobId:"v1",source:"generated"}]);
    service=new ModificationRequests(new ModificationRequestStore(dir),boards,assets,history);
    input={boardId:board.id,nodeId:"speaker",sourcePath:source,sourceVersionId:"v1",instruction:"把网罩改绿，其他保持不变",regions:[{kind:"rect",x:.1,y:.2,width:.5,height:.4}],annotationDataUrl:`data:image/png;base64,${png}`};
  });
  afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
  it("survives reload and pins V1 while the active image advances to V2",async()=>{
    const request=await service.create(input);
    const [v2]=await assets.saveOutputs("v2",[{bytes:Buffer.from(png,"base64"),mimeType:"image/png"}]);
    await boards.appendVersions(input.boardId,input.nodeId,[{imagePath:v2,jobId:"v2"}]);
    const reopened=new ModificationRequests(new ModificationRequestStore(dir),boards,assets,history);
    const claimed=await reopened.claim(request.id,"codex-session");
    expect(claimed).toMatchObject({sourcePath:input.sourcePath,sourceVersionId:"v1",status:"claimed"});
    expect(await assets.isReadable(claimed.annotationPath!)).toBe(true);
  });
  it("allows only one competing agent to claim the request",async()=>{
    const request=await service.create(input);
    const results=await Promise.allSettled([service.claim(request.id,"one"),service.claim(request.id,"two")]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
  });
  it("returns the claim capability only to the claimant and never exposes it through normal reads", async () => {
    const request = await service.create(input);
    const claimed = await service.claim(request.id, "owner");
    const token = claimed.claim!.token;
    expect(token).toBeTruthy();
    expect((await service.get(request.id)).claim).toEqual({ owner: "owner", claimedAt: claimed.claim!.claimedAt });
    expect(JSON.stringify(await service.list())).not.toContain(token);
    await expect(service.prepare(request.id, "other-token")).rejects.toThrow("接手凭证");
    await expect(service.finish({ id: request.id, claimToken: "other-token", error: "stolen" })).rejects.toThrow("接手凭证");
  });
  it("atomically reuses one durable paid execution identity for repeated preparations and reloads", async () => {
    const request = await service.create(input);
    const claimed = await service.claim(request.id, "owner");
    const prepared = await Promise.all([service.prepare(request.id, claimed.claim!.token), service.prepare(request.id, claimed.claim!.token)]);
    expect(prepared[0].executionKey).toBe(prepared[1].executionKey);
    expect(prepared[0].executionKey).toContain(request.id);
    expect(JSON.stringify(prepared)).not.toContain(claimed.claim!.token);
    const reopened = new ModificationRequests(new ModificationRequestStore(dir), boards, assets, history);
    expect((await reopened.prepare(request.id, claimed.claim!.token)).executionKey).toBe(prepared[0].executionKey);
  });
  it("rejects old, unrelated and differently billed edit results, then accepts only its bound execution once", async () => {
    const request = await service.create(input);
    const claimed = await service.claim(request.id, "owner");
    const prepared = await service.prepare(request.id, claimed.claim!.token);
    const [output] = await assets.saveOutputs("modified", [{ bytes: Buffer.from(png, "base64"), mimeType: "image/png" }]);
    const job: GenerationJob = {
      id: "edit-result", status: "succeeded", createdAt: new Date().toISOString(), boardId: input.boardId, prompt: input.instruction,
      input: { workflowMode: "edit", prompt: input.instruction, model: "fixture", size: "auto", n: 1,
        modificationRequestId: request.id, idempotencyKey: prepared.executionKey, editSource: { imagePath: input.sourcePath } },
      referenceImagePaths: [input.sourcePath], outputImagePaths: [output]
    };
    const finish = { id: request.id, claimToken: claimed.claim!.token, resultJobId: job.id, resultPaths: [output] };
    await history.addJob({ ...job, createdAt: "2020-01-01T00:00:00Z" });
    await expect(service.finish(finish)).rejects.toThrow("不属于");
    await history.updateJob({ ...job, input: { ...job.input, modificationRequestId: "another-request" } });
    await expect(service.finish(finish)).rejects.toThrow("不属于");
    await history.updateJob({ ...job, input: { ...job.input, idempotencyKey: "different-paid-execution" } });
    await expect(service.finish(finish)).rejects.toThrow("不属于");
    await history.updateJob(job);
    expect((await service.finish(finish)).status).toBe("succeeded");
    await expect(service.finish(finish)).rejects.toThrow("接手凭证");
    const source = (await boards.getBoard(input.boardId))?.nodes.find(node => node.id === input.nodeId);
    expect(source && "versions" in source ? source.versions?.filter(version => "imagePath" in version && version.imagePath === output) : []).toHaveLength(1);
    expect(JSON.stringify(await service.get(request.id))).not.toContain(claimed.claim!.token);
  });
  it("blocks an ambiguous brief until explicit clarification is saved",async()=>{
    const request=await service.create({...input,instruction:""});
    expect(request.status).toBe("needs-input");
    await expect(service.claim(request.id,"codex")).rejects.toThrow("澄清");
    await service.clarify(request.id,"只改网罩颜色");
    expect((await service.claim(request.id,"codex")).status).toBe("claimed");
  });
  it("rejects fabricated results and lost source versions without fallback",async()=>{
    const request=await service.create(input),claimed=await service.claim(request.id,"codex");
    await expect(service.finish({id:request.id,claimToken:claimed.claim!.token,resultJobId:"not-a-job",resultPaths:[input.sourcePath]})).rejects.toThrow("已完成");
    await boards.saveBoard({id:input.boardId,nodes:[]});
    await expect(service.create(input)).rejects.toThrow("源图片");
    expect((await service.get(request.id)).status).toBe("claimed");
  });
});
