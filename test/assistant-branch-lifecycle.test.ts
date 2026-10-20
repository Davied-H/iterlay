// @vitest-environment jsdom
import { act, createElement, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useAssistantBranchLifecycle } from "../src/features/assistant/use-assistant-branch-lifecycle";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("assistant branch restoration lifecycle", () => {
  it("keeps history restoration alive while readiness, composer text and late plugin guidance change", async () => {
    let resolve!: (value: string) => void;
    const history = new Promise<string>((yes) => { resolve = yes; });
    const cleanup = vi.fn();
    const enter = vi.fn();
    const root = createRoot(document.createElement("div"));
    let messages = "";
    function Harness({ ready, guide }: { ready: boolean; guide: string }) {
      const [restored, setRestored] = useState("");
      useAssistantBranchLifecycle("board:canvas-prompt:general", "board", (restore) => {
        enter(restore, ready, guide);
        let cancelled = false;
        void history.then((text) => { if (!cancelled) setRestored(text); });
        return () => { cancelled = true; cleanup(); };
      });
      messages = restored;
      return null;
    }
    try {
      await act(async () => root.render(createElement(Harness, { ready: false, guide: "" })));
      await act(async () => root.render(createElement(Harness, { ready: true, guide: "插件引导已到达" })));
      expect(enter).toHaveBeenCalledTimes(1);
      expect(cleanup).not.toHaveBeenCalled();
      await act(async () => resolve("保存过的历史消息"));
      expect(messages).toBe("保存过的历史消息");
      await act(async () => root.render(createElement(Harness, { ready: true, guide: "再次更新引导" })));
      expect(messages).toBe("保存过的历史消息");
      expect(cleanup).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("restores on first entry and board switches while preserving new branches for same-board context changes", async () => {
    const enter = vi.fn<(restore: boolean) => void>(() => undefined);
    const root = createRoot(document.createElement("div"));
    function Harness({ signature, boardId }: { signature: string; boardId: string }) {
      useAssistantBranchLifecycle(signature, boardId, enter);
      return null;
    }
    try {
      await act(async () => root.render(createElement(Harness, { signature: "one:general", boardId: "one" })));
      await act(async () => root.render(createElement(Harness, { signature: "one:ui-design", boardId: "one" })));
      await act(async () => root.render(createElement(Harness, { signature: "two:general", boardId: "two" })));
      expect(enter.mock.calls).toEqual([[true], [false], [true]]);
    } finally { await act(async () => root.unmount()); }
  });

  it("repeats the restoration intent after StrictMode cleanup instead of dropping the initial history request", async () => {
    const intents: boolean[] = [];
    const cleanup = vi.fn();
    const root = createRoot(document.createElement("div"));
    function Harness() { useAssistantBranchLifecycle("board:general", "board", (restore) => { intents.push(restore); return cleanup; }); return null; }
    try {
      await act(async () => root.render(createElement(StrictMode, null, createElement(Harness))));
      expect(intents).toEqual([true, true]);
      expect(cleanup).toHaveBeenCalledOnce();
    } finally { await act(async () => root.unmount()); }
  });
});
