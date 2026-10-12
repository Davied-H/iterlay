// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { ComicCharacterNode, ComicSettingNode } from "../shared/types";
import { ComicDramaNode } from "../src/components/canvas/ComicDramaNode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} };

describe("comic drama semantic card UI", () => {
  it("keeps long content accessible and saves edits as a new immutable version", async () => {
    const longTitle = "连续英数VeryLongTitleWithoutSpaces123456789012345678901234567890";
    const node: ComicSettingNode = {
      id: "setting", type: "comic-setting", x: 0, y: 0, status: "saved", activeVersionId: "v1",
      versions: [{ versionId: "v1", createdAt: "2026-08-22T08:00:00.000Z", fields: {
        title: longTitle, synopsis: "很长的梗概".repeat(80), genre: "悬疑", tone: "克制", worldRules: [], visualStyle: "冷色手绘", constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30
      } }]
    };
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ReactFlowProvider, null, createElement(ComicDramaNode, {
      id: node.id, type: "comicSettingNode", selected: true, dragging: false, draggable: true, selectable: true, deletable: true, zIndex: 0, isConnectable: true,
      positionAbsoluteX: 0, positionAbsoluteY: 0, data: { node, onChange }
    }))));

    expect(container.querySelector('[role="group"]')?.getAttribute("aria-label")).toContain(longTitle);
    expect(container.querySelector('[data-comic-drama-node="comic-setting"]')).not.toBeNull();
    expect(container.querySelector(".comic-drama-node__header-status")?.textContent).toContain("已保存");
    expect(container.querySelector(".comic-drama-node__title")?.getAttribute("title")).toBeNull();
    const edit = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("编辑设定"));
    await act(async () => edit?.click());
    const titleInput = [...document.body.querySelectorAll<HTMLInputElement>("input")].find((input) => input.value === longTitle);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(titleInput, "雨夜来信");
      titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("保存新版本"));
    await act(async () => save?.click());

    expect(onChange).toHaveBeenCalledWith("setting", expect.objectContaining({
      status: "saved", activeVersionId: expect.any(String), versions: expect.arrayContaining([expect.objectContaining({ versionId: "v1" })])
    }));
    expect(onChange.mock.calls[0]?.[1].versions).toHaveLength(2);
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the concrete provider error on a failed character card", async () => {
    const node: ComicCharacterNode = {
      id: "character", type: "comic-character", x: 0, y: 0, name: "主角", status: "failed",
      generationError: "Provider 鉴权失败，请检查 API Key。",
      activeVersionId: "v1",
      versions: [{ versionId: "v1", createdAt: "2026-08-22T08:00:00.000Z", fields: {
        role: "推动主线的核心角色",
        profile: "旧物修复师",
        appearanceAnchors: ["短黑发", "深色围裙"],
        visualPrompt: "冷色手绘角色设定"
      } }]
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ReactFlowProvider, null, createElement(ComicDramaNode, {
      id: node.id, type: "comicCharacterNode", selected: false, dragging: false, draggable: true, selectable: true, deletable: true, zIndex: 0, isConnectable: true,
      positionAbsoluteX: 0, positionAbsoluteY: 0, data: { node }
    }))));

    const failure = container.querySelector('[data-error="true"]');
    expect(failure?.textContent).toContain("角色形象生成失败");
    expect(failure?.textContent).toContain("Provider 鉴权失败，请检查 API Key。");
    await act(async () => root.unmount());
    container.remove();
  });
});
