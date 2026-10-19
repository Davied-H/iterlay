// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ModificationRequestsDialog } from "../src/components/workbench/ModificationRequestsDialog";
import { loadUiTextCatalog } from "../src/i18n/ui-text";
import type { PublicModificationRequest } from "../shared/modification-requests";

const api = vi.hoisted(() => ({ listModificationRequests: vi.fn(), clarifyModificationRequest: vi.fn() }));
vi.mock("../src/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => api,
  getWorkbenchErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const focus = vi.fn();
const changeOpen = vi.fn();
const writeText = vi.fn();
const request = (overrides: Partial<PublicModificationRequest> = {}): PublicModificationRequest => ({
  schemaVersion: 1, id: "request-one", boardId: "board-one", nodeId: "image-one",
  sourcePath: "/managed/source.png", sourceVersionId: "job-original", status: "needs-input",
  createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z", instruction: "",
  regions: [{ kind: "rect", x: 0.2, y: 0.2, width: 0.1, height: 0.1 }], constraints: [], referencePaths: [],
  annotationPath: "/managed/annotation.png", ...overrides
});
function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function mount(boardId = "board-one"): Promise<void> {
  await act(async () => root.render(createElement(ModificationRequestsDialog, { open: true, onOpenChange: changeOpen, boardId, onFocus: focus })));
}
async function setInstruction(value: string): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeAll(async () => { await loadUiTextCatalog(); });
beforeEach(() => {
  document.documentElement.lang = "zh-CN";
  api.listModificationRequests.mockReset().mockResolvedValue([request()]);
  api.clarifyModificationRequest.mockReset();
  focus.mockReset(); changeOpen.mockReset(); writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); document.documentElement.lang = "";
});

describe("agent edit request UI", () => {
  it("renders the complete English surface without exposing claim capabilities", async () => {
    document.documentElement.lang = "en-US";
    api.listModificationRequests.mockResolvedValue([request({
      status: "claimed", instruction: "Keep product, replace background",
      claim: { owner: "worker-two", claimedAt: "2026-10-19T00:00:00Z", token: "never-render-this-token" } as PublicModificationRequest["claim"]
    })]);
    await mount();
    expect(document.body.textContent).toContain("Agent edit requests");
    expect(document.body.textContent).toContain("Claimed by an agent");
    expect(document.body.textContent).toContain("Pinned source version: job-original");
    expect(document.body.textContent).toContain("Includes an annotated image");
    expect(document.body.textContent).toContain("Claimed by: worker-two");
    expect(document.body.textContent).not.toContain("never-render-this-token");
    expect(document.body.textContent).not.toMatch(/[\u4e00-\u9fff]/u);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(true);
    expect(document.querySelector("label")?.htmlFor).toBe(document.querySelector("textarea")?.id);
  });

  it("retains failed clarification input for retry and updates only the returned request", async () => {
    await mount();
    await setInstruction("  Keep the speaker, replace only the wall  ");
    api.clarifyModificationRequest.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => button("保存修改要求").click());
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("  Keep the speaker, replace only the wall  ");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Offline");
    expect(button("保存修改要求").disabled).toBe(false);
    api.clarifyModificationRequest.mockResolvedValueOnce(request({ status: "ready", instruction: "Keep the speaker, replace only the wall" }));
    await act(async () => button("保存修改要求").click());
    expect(api.clarifyModificationRequest).toHaveBeenLastCalledWith("request-one", "Keep the speaker, replace only the wall");
    expect(document.body.textContent).toContain("等待 Agent 接手");
    expect(document.body.textContent).toContain("修改要求已保存，等待 Agent 接手；尚未执行生成。");
    expect(document.body.textContent).toContain("job-original");
  });

  it("blocks conflicting edits, refresh, copy and focus while a request is being saved", async () => {
    const pending = deferred<PublicModificationRequest>();
    api.listModificationRequests.mockResolvedValue([request(), request({ id: "request-two", nodeId: "image-two", instruction: "Second request" })]);
    api.clarifyModificationRequest.mockReturnValue(pending.promise);
    await mount(); await setInstruction("Replace background");
    await act(async () => button("保存修改要求").click());
    expect(button("刷新状态").disabled).toBe(true);
    expect(button("复制接手说明").disabled).toBe(true);
    expect(button("定位源图").disabled).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('nav button')].every((node) => node.disabled)).toBe(true);
    await act(async () => pending.resolve(request({ status: "ready", instruction: "Replace background" })));
    expect(button("刷新状态").disabled).toBe(false);
  });

  it("copies usable CLI handoff instructions and focuses the selected source without serializing the request", async () => {
    api.listModificationRequests.mockResolvedValue([request({ status: "claimed", claim: { owner: "worker", claimedAt: "now", token: "private-token" } as PublicModificationRequest["claim"] })]);
    await mount();
    await act(async () => button("复制接手说明").click());
    const handoff = writeText.mock.calls[0][0] as string;
    expect(handoff).toContain("request-one");
    for (const tool of ["get_modification_request", "claim_modification_request", "clarify_modification_request", "edit_image", "finish_modification_request"]) expect(handoff).toContain(tool);
    expect(handoff).toContain("modificationRequestId"); expect(handoff).toContain("claimToken");
    expect(handoff).not.toContain("private-token"); expect(handoff).not.toContain("/managed/source.png");
    await act(async () => button("定位源图").click());
    expect(focus).toHaveBeenCalledWith("image-one"); expect(changeOpen).toHaveBeenCalledWith(false);
  });

  it("ignores an old board's delayed response after switching boards", async () => {
    const old = deferred<PublicModificationRequest[]>();
    api.listModificationRequests.mockReturnValueOnce(old.promise).mockResolvedValueOnce([request({ id: "new-board-request", instruction: "NEW BOARD", boardId: "board-two" })]);
    await mount(); await mount("board-two");
    expect(document.body.textContent).toContain("NEW BOARD");
    await act(async () => old.resolve([request({ instruction: "OLD BOARD" })]));
    expect(document.body.textContent).toContain("NEW BOARD"); expect(document.body.textContent).not.toContain("OLD BOARD");
  });
});
