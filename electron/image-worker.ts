import { parentPort } from "node:worker_threads";
import { bgraToRgba, encodeThumbHashEntry } from "./thumbhash-encoder.js";

export interface ThumbHashWorkerRequest {
  id: number;
  bgra: Uint8Array;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface ThumbHashWorkerResponse {
  id: number;
  result?: { hash: string; hasAlpha: boolean; width: number; height: number };
  error?: string;
}

parentPort?.on("message", (request: ThumbHashWorkerRequest) => {
  try {
    const rgba = bgraToRgba(request.bgra);
    const encoded = encodeThumbHashEntry(rgba, request.width, request.height);
    parentPort?.postMessage({
      id: request.id,
      result: { ...encoded, width: request.sourceWidth, height: request.sourceHeight }
    } satisfies ThumbHashWorkerResponse);
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error)
    } satisfies ThumbHashWorkerResponse);
  }
});
