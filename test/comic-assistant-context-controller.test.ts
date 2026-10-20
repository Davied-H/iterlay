// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useComicAssistantContext } from "../src/features/assistant/use-comic-assistant-context";
import type { ComicDramaBoardSnapshot } from "../shared/types";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/features/plugins/request-plugin-capability", () => ({ requestPluginCapability: request }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.clearAllMocks());

describe("installed comic assistant context", () => {
  it("does not request comic capabilities for normal boards or loop on equivalent empty selections", async () => {
    const root = createRoot(document.createElement("div"));
    let renders = 0;
    function Harness() { renders++; useComicAssistantContext(false, null, []); return null; }
    try {
      await act(async () => root.render(createElement(Harness)));
      await act(async () => root.render(createElement(Harness)));
      expect(request).not.toHaveBeenCalled();
      expect(renders).toBe(2);
    } finally { await act(async () => root.unmount()); }
  });
  it("uses installed guide/context once per selection and aborts pending requests on unmount", async () => {
    const guide = { stage: "setting", message: "插件引导", suggestions: ["方向"], placeholder: "输入" };
    request.mockImplementation((_plugin, capability) => Promise.resolve(capability === "comic.guide" ? guide : "插件上下文"));
    const snapshot = { boardId: "comic", revision: 1, nodes: [], connections: [], groups: [] } as unknown as ComicDramaBoardSnapshot;
    const root = createRoot(document.createElement("div"));
    let current!: ReturnType<typeof useComicAssistantContext>;
    function Harness() { current = useComicAssistantContext(true, snapshot, ["one"]); return null; }
    try {
      await act(async () => root.render(createElement(Harness)));
      expect(current).toEqual({ guide, context: "插件上下文" });
      await act(async () => root.render(createElement(Harness)));
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls.map(([, capability]) => capability)).toEqual(["comic.guide", "comic.context"]);
      expect(request.mock.calls[0][3].signal.aborted).toBe(false);
    } finally { await act(async () => root.unmount()); }
    expect(request.mock.calls[0][3].signal.aborted).toBe(true);
  });
});
