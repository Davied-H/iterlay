import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: {}, BrowserWindow: {}, dialog: {}, ipcMain: {} }));
import { WindowSaveRequests } from "../electron/window-lifecycle";
describe("window save acknowledgements", () => {
  it("accepts only the matching window and request", async () => {
    let id = "";
    const requests = new WindowSaveRequests((_sender, request) => { id = request; });
    requests.markReady(1);
    let settled = false;
    const saving = requests.request(1).then(() => { settled = true; });
    requests.accept(2, { requestId: id, ok: true });
    await Promise.resolve();
    expect(settled).toBe(false);
    requests.accept(1, { requestId: id, ok: true });
    await saving;
    expect(settled).toBe(true);
  });
  it("propagates disk failures and permits a later retry", async () => {
    let id = "";
    const requests = new WindowSaveRequests((_sender, request) => { id = request; });
    requests.markReady(1);
    const saving = requests.request(1);
    requests.accept(1, { requestId: id, ok: false, error: "disk full" });
    await expect(saving).rejects.toThrow("disk full");
    const retry = requests.request(1);
    requests.accept(1, { requestId: id, ok: true });
    await retry;
  });
  it("does not hang on reload or request timeout", async () => {
    const requests = new WindowSaveRequests(() => undefined, 5);
    requests.markReady(1);
    const saving = requests.request(1);
    requests.forget(1);
    await expect(saving).rejects.toThrow("重新加载");
    requests.markReady(1);
    await expect(requests.request(1)).rejects.toThrow("超时");
  });
});
