import { describe, expect, it, vi } from "vitest";
import { createScreenAccessService } from "../electron/application/screen-access";
import { continueWithScreenCapture } from "../electron/application/screen-collaboration";
import { sanitizeAssistantToolDetails } from "../shared/assistant-display";
import type { ScreenAccessPolicy } from "../shared/screen-access";
import type { CollaborateSceneRequest } from "../shared/types";

function fixture(initial: ScreenAccessPolicy = "ask") {
  let policy = initial;
  const capture = vi.fn(async () => ({ mimeType: "image/png" as const, dataBase64: "screen-pixels", width: 1200, height: 800 }));
  const setPolicy = vi.fn((next: "allow") => { policy = next; });
  const service = createScreenAccessService({ capture, getPolicy: () => policy, setPolicy });
  return { service, capture, setPolicy, set: (next: ScreenAccessPolicy) => { policy = next; } };
}
const context = { reason: "识别当前屏幕上的内容", providerLabel: "用户配置的对话模型" };

describe("host-enforced screen authorization", () => {
  it("waits for the authorization card before capturing and keeps allow-once ephemeral", async () => {
    const f = fixture();
    let decide!: (result: { action: "submit"; values: { permissionDecision: string } }) => void;
    const presentInteraction = vi.fn(() => new Promise<{ action: "submit"; values: { permissionDecision: string } }>((resolve) => { decide = resolve; }));
    const result = f.service({ ...context, presentInteraction });
    expect(presentInteraction).toHaveBeenCalledWith(expect.objectContaining({ type: "permission", capability: "screen-capture", providerLabel: context.providerLabel }));
    expect(f.capture).not.toHaveBeenCalled();
    decide({ action: "submit", values: { permissionDecision: "allow_once" } });
    expect((await result).dataBase64).toBe("screen-pixels");
    expect(f.capture).toHaveBeenCalledOnce();
    expect(f.setPolicy).not.toHaveBeenCalled();
    await expect(f.service(context)).rejects.toThrow("应用内授权");
  });
  it.each(["deny", "bad-decision", undefined])("does not capture after denial or a malformed decision: %s", async (decision) => {
    const f = fixture();
    await expect(f.service({ ...context, presentInteraction: async () => ({ action: "submit", values: decision ? { permissionDecision: decision } : undefined }) })).rejects.toThrow("未授权");
    expect(f.capture).not.toHaveBeenCalled();
  });
  it("persists allow-always but honors a subsequent revocation", async () => {
    const f = fixture();
    const presentInteraction = vi.fn(async () => ({ action: "submit" as const, values: { permissionDecision: "allow_always" } }));
    await f.service({ ...context, presentInteraction });
    await f.service({ ...context, presentInteraction });
    expect(presentInteraction).toHaveBeenCalledOnce();
    expect(f.setPolicy).toHaveBeenCalledWith("allow");
    f.set("deny");
    await expect(f.service({ ...context, presentInteraction })).rejects.toThrow("设置中关闭");
    expect(f.capture).toHaveBeenCalledTimes(2);
  });
  it("rejects when permission is revoked or the request is cancelled while awaiting consent", async () => {
    for (const cancel of [false, true]) {
      const f = fixture(); const abort = new AbortController();
      await expect(f.service({ ...context, signal: abort.signal, presentInteraction: async () => {
        if (cancel) abort.abort(); else f.set("deny");
        return { action: "submit", values: { permissionDecision: "allow_once" } };
      } })).rejects.toThrow(cancel ? "取消" : "设置中关闭");
      expect(f.capture).not.toHaveBeenCalled();
    }
  });
  it("does not disclose pixels if revoked while the OS is capturing", async () => {
    let policy: ScreenAccessPolicy = "allow";
    const service = createScreenAccessService({ getPolicy: () => policy, setPolicy: () => {}, capture: async () => { policy = "deny"; return { mimeType: "image/png", dataBase64: "private", width: 1, height: 1 }; } });
    await expect(service(context)).rejects.toThrow("设置中关闭");
  });
  it("redacts image bytes from tool logs and persisted tool receipts", () => {
    const output = sanitizeAssistantToolDetails({ content: [{ type: "image", mimeType: "image/png", data: "private-screen-bytes" }] });
    expect(output).toContain("image omitted");
    expect(output).not.toContain("private-screen-bytes");
  });
});

it("continues a plain conversation with the authorized snapshot without mutating the original request", async () => {
  const request: CollaborateSceneRequest = { instruction: "你能看到我桌面有什么吗", workflowMode: "generate", referenceImages: [], currentFields: [] };
  const f = fixture("allow");
  const analyze = vi.fn(async () => ({ message: "屏幕上有一个编辑器窗口。", fields: [], intent: "chat" as const }));
  const result = await continueWithScreenCapture({ request, result: { message: "需要查看当前屏幕", fields: [], actions: [{ type: "request_screen_capture", reason: context.reason }] }, capture: () => f.service(context), analyze });
  expect(result.message).toContain("编辑器");
  expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ screenCaptureAvailable: false, referenceImages: [expect.objectContaining({ dataBase64: "screen-pixels" })] }));
  expect(request.referenceImages).toEqual([]);
});

it("revokes an in-flight persistent grant when settings return to ask", async () => {
  let policy: ScreenAccessPolicy = "allow";
  const service = createScreenAccessService({ getPolicy: () => policy, setPolicy: () => {}, capture: async () => {
    policy = "ask"; return { mimeType: "image/png", dataBase64: "private", width: 1, height: 1 };
  } });
  await expect(service(context)).rejects.toThrow("持续授权已撤销");
});
