import type { WindowSaveResult } from "../shared/window-lifecycle.js";

export class WindowSaveRequests {
  private readonly ready = new Set<number>();
  private readonly pending = new Map<string, { senderId: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly send: (senderId: number, requestId: string) => void, private readonly timeoutMs = 15_000) {}
  markReady(senderId: number): void { this.ready.add(senderId); }
  forget(senderId: number): void {
    this.ready.delete(senderId);
    for (const [id, request] of this.pending) {
      if (request.senderId !== senderId) continue;
      clearTimeout(request.timer);
      this.pending.delete(id);
      request.reject(new Error("保存期间窗口已关闭或重新加载。"));
    }
  }
  request(senderId: number): Promise<void> {
    if (!this.ready.has(senderId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("等待画板保存超时。请重试，或明确选择不保存退出。"));
      }, this.timeoutMs);
      this.pending.set(requestId, { senderId, resolve, reject, timer });
      try { this.send(senderId, requestId); }
      catch (error) { this.accept(senderId, { requestId, ok: false, error: String(error) }); }
    });
  }
  accept(senderId: number, result: WindowSaveResult): void {
    if (!result || typeof result.requestId !== "string") return;
    const request = this.pending.get(result.requestId);
    if (!request || request.senderId !== senderId) return;
    clearTimeout(request.timer);
    this.pending.delete(result.requestId);
    if (result.ok === true) request.resolve();
    else request.reject(new Error(result.error || "画板尚未保存。"));
  }
}

