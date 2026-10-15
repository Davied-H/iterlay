import { translateSourceText } from "@/i18n/ui-text";
import { createWorkbenchClient, type ImageWorkbenchApi, type WorkbenchTransport } from "@shared/workbench-client";
import { decodeDevBrowserWire, encodeDevBrowserWire } from "@shared/dev-browser-wire";
import { WINDOW_RENDERER_READY } from "@shared/window-lifecycle";
import { toast } from "sonner";

const BRIDGE_PREFIX = "/__iterlay_dev";
const SESSION_STORAGE_KEY = "iterlay:browser-debug-session";
const EDITOR_LOCK_NAME = "iterlay:browser-debug-editor";
const CONNECTION_TIMEOUT_MS = 10_000;
const CONNECTION_TOAST_ID = "browser-workbench-connection";
type Listener = (...args: unknown[]) => void;

interface BrowserWorkbenchWindow extends Window {
  __iterlayBrowserWorkbench?: BrowserWorkbenchConnection;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "网页调试通信失败。";
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(typeof body?.error === "string" ? body.error : "网页调试后端未连接，请先启动项目的网页调试开发服务。");
  }
  if (typeof body.error === "string") throw new Error(body.error);
  return body;
}

/** Kept on window so renderer HMR cannot create a second editing connection. */
class BrowserWorkbenchConnection {
  readonly api: ImageWorkbenchApi;
  ready: Promise<void>;
  private sessionId = "";
  private source: EventSource | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private sendQueue = Promise.resolve();
  private suspended = false;
  private disposed = false;
  private cancelConnection: (() => void) | null = null;
  private recoveryTimer: number | null = null;
  private recoveryRunning = false;
  private reconnectingSince: number | null = null;
  private rendererReady = false;
  private probeAbort: AbortController | null = null;
  private releaseEditingLock: (() => void) | null = null;

  constructor() {
    const transport: WorkbenchTransport = {
      invoke: (channel, ...args) => this.request("invoke", channel, args),
      send: (channel, ...args) => {
        if (channel === WINDOW_RENDERER_READY) this.rendererReady = true;
        this.sendQueue = this.sendQueue.then(() => this.request("send", channel, args)).then(() => undefined).catch(this.reportError);
      },
      on: (channel, listener) => {
        const payloadListener = listener as Listener;
        let channelListeners = this.listeners.get(channel);
        if (!channelListeners) {
          channelListeners = new Set();
          this.listeners.set(channel, channelListeners);
        }
        channelListeners.add(payloadListener);
        return () => {
          channelListeners.delete(payloadListener);
          if (!channelListeners.size) this.listeners.delete(channel);
        };
      }
    };
    this.api = createWorkbenchClient(transport);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    this.ready = this.connect();
  }

  private reportError = (error: unknown): void => {
    console.error("Iterlay 网页调试通信失败：", error);
    window.dispatchEvent(new CustomEvent("iterlay:browser-workbench-error", { detail: describeError(error) }));
  };

  private setConnectionState(state: "connecting" | "connected" | "reconnecting" | "restarting" | "disconnected"): void {
    document.documentElement.dataset.workbenchConnection = state;
  }

  private async connect(): Promise<void> {
    this.suspended = false;
    this.setConnectionState("connecting");
    await this.acquireEditingLock();
    let savedSession = this.sessionId;
    try { savedSession ||= window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? ""; } catch { /* Storage may be disabled. */ }
    const query = savedSession ? `?sessionId=${encodeURIComponent(savedSession)}` : "";
    const body = await fetch(`${BRIDGE_PREFIX}/session${query}`, {
      cache: "no-store", signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS)
    }).then(readResponse);
    if (typeof body.sessionId !== "string" || !body.sessionId) throw new Error("网页调试后端返回了无效的会话。");
    this.sessionId = body.sessionId;
    this.persistSession();
    if (this.disposed || this.suspended) throw new Error("网页调试连接已关闭。");
    const source = new EventSource(`${BRIDGE_PREFIX}/events?sessionId=${encodeURIComponent(this.sessionId)}`);
    this.source = source;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        source.close();
        this.setConnectionState("disconnected");
        reject(new Error("网页调试事件连接超时，请检查本地开发后端是否正在运行。"));
      }, CONNECTION_TIMEOUT_MS);
      this.cancelConnection = () => {
        window.clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("网页调试连接已关闭。"));
        }
      };
      source.addEventListener("ready", () => {
        this.stopRecovery();
        this.setConnectionState("connected");
        toast.dismiss(CONNECTION_TOAST_ID);
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve();
        }
        if (this.rendererReady) void this.request("send", WINDOW_RENDERER_READY, []).catch(this.reportError);
      });
      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as { channel?: unknown; args?: unknown };
          const args = decodeDevBrowserWire(payload.args);
          if (typeof payload.channel !== "string" || !Array.isArray(args)) throw new Error("网页调试事件格式无效。");
          for (const listener of this.listeners.get(payload.channel) ?? []) {
            try { listener(...args); } catch (error) { this.reportError(error); }
          }
        } catch (error) { this.reportError(error); }
      };
      // EventSource reconnects using the same session; a new ready event marks recovery.
      source.onerror = () => {
        if (this.suspended || this.disposed) return;
        this.setConnectionState("reconnecting");
        if (this.reconnectingSince === null) {
          this.reconnectingSince = Date.now();
          toast.loading(translateSourceText("本地调试后端连接中断，正在重连…"), { id: CONNECTION_TOAST_ID });
        }
        void this.recoverSession();
      };
    });
  }

  private async acquireEditingLock(): Promise<void> {
    if (this.releaseEditingLock || typeof navigator.locks?.request !== "function") return;
    await new Promise<void>((resolve, reject) => {
      // Duplicating a tab clones sessionStorage. A document-held origin lock keeps
      // that copied session ID from taking over the first tab's event stream.
      void navigator.locks.request(EDITOR_LOCK_NAME, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          reject(new Error("已有网页正在调试此工作区，请先关闭原来的调试页面。"));
          return;
        }
        if (this.disposed || this.suspended) {
          reject(new Error("网页调试连接已关闭。"));
          return;
        }
        await new Promise<void>((release) => {
          this.releaseEditingLock = () => { this.releaseEditingLock = null; release(); };
          resolve();
        });
      }).catch(reject);
    });
  }

  private persistSession(): void {
    try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, this.sessionId); } catch { /* Keep the in-memory session. */ }
  }

  private stopRecovery(): void {
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.reconnectingSince = null;
    this.probeAbort?.abort();
    this.probeAbort = null;
  }

  private async recoverSession(): Promise<void> {
    if (this.recoveryRunning || this.recoveryTimer !== null || this.reconnectingSince === null || this.suspended || this.disposed) return;
    this.recoveryRunning = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
    this.probeAbort = controller;
    try {
      const body = await fetch(`${BRIDGE_PREFIX}/session?sessionId=${encodeURIComponent(this.sessionId)}`, {
        cache: "no-store", signal: controller.signal
      }).then(readResponse);
      if (this.reconnectingSince === null || this.suspended || this.disposed) return;
      if (typeof body.sessionId !== "string" || !body.sessionId) throw new Error("网页调试后端返回了无效的会话。");
      if (body.sessionId !== this.sessionId) {
        this.sessionId = body.sessionId;
        this.persistSession();
        this.source?.close();
        this.stopRecovery();
        this.setConnectionState("restarting");
        toast.loading(translateSourceText("开发后端已重启，正在重新加载工作区…"), { id: CONNECTION_TOAST_ID });
        const saves: Promise<void>[] = [];
        window.dispatchEvent(new CustomEvent("iterlay:browser-workbench-before-reload", {
          detail: { waitUntil: (task: Promise<void>) => { saves.push(task); } }
        }));
        try {
          await Promise.all(saves);
          if (window.dispatchEvent(new Event("iterlay:browser-workbench-reload", { cancelable: true }))) window.location.reload();
        } catch (error) {
          this.setConnectionState("disconnected");
          toast.error(translateSourceText("画板保存失败，请重试保存后刷新页面：{{ui:0}}", [describeError(error)]), { id: CONNECTION_TOAST_ID, duration: Infinity });
        }
        return;
      }
    } catch (error) {
      if (!controller.signal.aborted && this.reconnectingSince !== null && Date.now() - this.reconnectingSince >= CONNECTION_TIMEOUT_MS) {
        this.setConnectionState("disconnected");
        toast.error(translateSourceText("本地后端尚未连接，将继续重试。{{ui:0}}", [describeError(error)]), { id: CONNECTION_TOAST_ID, duration: Infinity });
      }
    } finally {
      window.clearTimeout(timeout);
      this.recoveryRunning = false;
      if (this.probeAbort === controller) this.probeAbort = null;
      if (this.reconnectingSince !== null && !this.suspended && !this.disposed) {
        if (Date.now() - this.reconnectingSince >= CONNECTION_TIMEOUT_MS
          && document.documentElement.dataset.workbenchConnection !== "disconnected") {
          this.setConnectionState("disconnected");
          toast.error(translateSourceText("本地调试连接尚未恢复，请检查开发终端；网页会继续尝试重连。"), { id: CONNECTION_TOAST_ID, duration: Infinity });
        }
        this.recoveryTimer = window.setTimeout(() => {
          this.recoveryTimer = null;
          void this.recoverSession();
        }, 1_000);
      }
    }
  }

  private async request(kind: "invoke" | "send", channel: string, args: unknown[]): Promise<unknown> {
    await this.ready;
    if (this.disposed || this.suspended) throw new Error("网页调试连接已关闭，请重新打开页面。");
    const attachments: Blob[] = [];
    const encodedArgs = encodeDevBrowserWire(args, (bytes) => {
      attachments.push(new Blob([bytes], { type: "application/octet-stream" }));
      return attachments.length - 1;
    });
    const payload = JSON.stringify({ sessionId: this.sessionId, channel, args: encodedArgs });
    let requestBody: string | FormData = payload;
    if (attachments.length) {
      const form = new FormData();
      form.append("payload", payload);
      attachments.forEach((attachment, index) => form.append(`attachment:${index}`, attachment, `binary-${index}`));
      requestBody = form;
    }
    const body = await fetch(`${BRIDGE_PREFIX}/${kind}`, {
      method: "POST",
      headers: attachments.length ? undefined : { "content-type": "application/json" },
      body: requestBody
    }).then(readResponse);
    return decodeDevBrowserWire(body.result);
  }

  private onPageHide = (): void => {
    this.suspended = true;
    this.releaseEditingLock?.();
    this.stopRecovery();
    this.source?.close();
    this.cancelConnection?.();
    this.setConnectionState("disconnected");
    if (!this.sessionId) return;
    const body = JSON.stringify({ sessionId: this.sessionId });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(`${BRIDGE_PREFIX}/disconnect`, blob)) {
      void fetch(`${BRIDGE_PREFIX}/disconnect`, {
        method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true
      }).catch(() => undefined);
    }
  };

  private onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || this.disposed) return;
    this.ready = this.connect();
    void this.ready.catch((error: unknown) => {
      this.setConnectionState("disconnected");
      toast.error(describeError(error), { id: CONNECTION_TOAST_ID, duration: Infinity });
      this.reportError(error);
    });
  };

  dispose(): void {
    this.disposed = true;
    this.releaseEditingLock?.();
    this.stopRecovery();
    this.source?.close();
    this.cancelConnection?.();
    this.listeners.clear();
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
  }
}

export function isBrowserWorkbench(): boolean {
  const host = window as BrowserWorkbenchWindow;
  return Boolean(host.__iterlayBrowserWorkbench && host.imageWorkbench === host.__iterlayBrowserWorkbench.api);
}

export async function initializeBrowserWorkbench(): Promise<void> {
  if (!import.meta.env.DEV || window.imageWorkbench) return;
  const host = window as BrowserWorkbenchWindow;
  const connection = host.__iterlayBrowserWorkbench ??= new BrowserWorkbenchConnection();
  try {
    await connection.ready;
    host.imageWorkbench = connection.api;
  } catch (error) {
    connection.dispose();
    if (host.__iterlayBrowserWorkbench === connection) delete host.__iterlayBrowserWorkbench;
    throw error;
  }
}
