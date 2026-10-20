// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CommentRail } from "../src/components/workbench/CommentRail";
import type { CommentAgentHandoffResult } from "../shared/agent-integration";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("comment rail AI handoff", () => {
  it("keeps the action at the bottom, removes the header divider, and shows loading until the draft is prepared", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let resolve!: (result: CommentAgentHandoffResult) => void;
    const handoff = vi.fn(() => new Promise<CommentAgentHandoffResult>((done) => { resolve = done; }));
    try {
      await act(async () => root.render(createElement(CommentRail, {
        comments: [{ id: "comment", imagePath: "/image.png", text: "调整背景", createdAt: "2026-10-19" }],
        thumbFor: () => undefined, onFocusImage: vi.fn(), onDeleteComment: vi.fn(), onClose: vi.fn(), onHandoffToAgent: handoff
      })));
      const action = container.querySelector<HTMLButtonElement>('[aria-label="交给 AI 处理评论"]')!;
      expect(action.closest("footer")).not.toBeNull();
      expect(container.querySelector("header")?.className).not.toContain("border-b");
      await act(async () => action.click());
      expect(action.disabled).toBe(true);
      expect(handoff).toHaveBeenCalledOnce();
      expect(action.textContent).toContain("正在打开");
      await act(async () => resolve({ agent: "codex", contextPath: "/handoff/comments.json", delivery: "draft" }));
      expect(action.disabled).toBe(false);
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("请确认后发送"));
    } finally { await act(async () => root.unmount()); }
  });

  it("disables handoff without comments", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const handoff = vi.fn();
    try {
      await act(async () => root.render(createElement(CommentRail, { comments: [], thumbFor: () => undefined,
        onFocusImage: vi.fn(), onDeleteComment: vi.fn(), onClose: vi.fn(), onHandoffToAgent: handoff })));
      const action = container.querySelector<HTMLButtonElement>('[aria-label="交给 AI 处理评论"]')!;
      expect(action.disabled).toBe(true);
      await act(async () => action.click());
      expect(handoff).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); }
  });
});
