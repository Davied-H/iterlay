import { app, ipcMain } from "electron";
import { ModificationRequests } from "./application/modification-requests.js";
import { ModificationRequestStore } from "./storage/modification-request-store.js";
import type { BoardStore } from "./storage/board-store.js";
import type { AssetStore } from "./storage/asset-store.js";
import type { HistoryStore } from "./storage/history-store.js";
import type { CreateModificationRequest, FinishModificationRequest } from "../shared/modification-requests.js";

export function registerModificationRequestIpc(boards: BoardStore,assets: AssetStore,history: HistoryStore): ModificationRequests {
  const service = new ModificationRequests(new ModificationRequestStore(app.getPath("userData")),boards,assets,history);
  ipcMain.handle("modifications:create",(_event,input:CreateModificationRequest)=>service.create(input));
  ipcMain.handle("modifications:list",(_event,boardId?:string)=>service.list(boardId));
  ipcMain.handle("modifications:get",(_event,id:string)=>service.get(id));
  ipcMain.handle("modifications:clarify",(_event,id:string,instruction:string)=>service.clarify(id,instruction));
  ipcMain.handle("modifications:prepare",(_event,id:string,claimToken:string)=>service.prepare(id,claimToken));
  ipcMain.handle("modifications:claim",(_event,id:string,owner:string)=>service.claim(id,owner));
  ipcMain.handle("modifications:finish",(_event,input:FinishModificationRequest)=>service.finish(input));
  return service;
}
