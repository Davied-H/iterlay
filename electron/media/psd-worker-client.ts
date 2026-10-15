import { Worker } from "node:worker_threads";
import type { PsdEncodeInput } from "./psd-worker.js";
export async function encodePsdInWorker(input: PsdEncodeInput, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) throw new Error("PSD 编码已取消。");
  if (process.env.VITEST) return (await import("./psd-worker.js")).encodePsd(input);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./psd-worker.js", import.meta.url));
    let settled = false;
    const finish = (error?: Error, bytes?: Uint8Array): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else if (bytes) resolve(bytes);
      else reject(new Error("PSD 编码没有返回内容。"));
    };
    const timer = setTimeout(() => finish(new Error("PSD 编码超时。")), 60_000);
    const abort = () => finish(new Error("PSD 编码已取消。"));
    signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (message: { bytes?: Uint8Array; error?: string }) => finish(message.error ? new Error(message.error) : undefined, message.bytes));
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => { if (!settled) finish(new Error(`PSD 线程提前退出：${code}`)); });
    try { worker.postMessage(input, input.layers.map((layer) => layer.bgra.buffer as ArrayBuffer)); }
    catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}
