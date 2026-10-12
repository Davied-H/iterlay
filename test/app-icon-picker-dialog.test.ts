// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppIconPickerDialog } from "../src/components/workbench/AppIconPickerDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AppIconPickerDialog", () => {
  it("keeps the system avatar, switches custom avatars, and only allows uploaded avatars to be deleted", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(createElement(AppIconPickerDialog, {
        open: true,
        appIcon: "mascot",
        customAppIcons: [{
          id: "portrait-1",
          name: "旅行头像",
          dataUrl: "data:image/png;base64,AAAA",
          createdAt: "2026-07-23T00:00:00.000Z"
        }],
        busy: false,
        onOpenChange: vi.fn(),
        onSelect,
        onUpload: vi.fn().mockResolvedValue(undefined),
        onDelete
      }));
    });

    expect(document.body.querySelector('[aria-label="删除头像 系统伙伴"]')).toBeNull();
    const customOption = document.body.querySelector<HTMLButtonElement>('[aria-label="使用旅行头像"]');
    await act(async () => customOption?.click());
    expect(onSelect).toHaveBeenCalledWith("custom:portrait-1");

    const deleteButton = document.body.querySelector<HTMLButtonElement>('[aria-label="删除头像 旅行头像"]');
    await act(async () => deleteButton?.click());
    expect(document.body.textContent).toContain("删除“旅行头像”？");

    const confirmDelete = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "删除");
    await act(async () => confirmDelete?.click());
    expect(onDelete).toHaveBeenCalledWith("portrait-1");

    await act(async () => root.unmount());
    container.remove();
  });

  it("uploads an image dropped onto the avatar library", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onUpload = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(createElement(AppIconPickerDialog, {
        open: true,
        appIcon: "mascot",
        customAppIcons: [],
        busy: false,
        onOpenChange: vi.fn(),
        onSelect: vi.fn().mockResolvedValue(undefined),
        onUpload,
        onDelete: vi.fn().mockResolvedValue(undefined)
      }));
    });

    const dropTarget = document.body.querySelector<HTMLElement>('[role="radiogroup"][aria-label="伙伴头像"]');
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file], types: ["Files"], dropEffect: "none" }
    });

    await act(async () => dropTarget?.dispatchEvent(drop));
    expect(onUpload).toHaveBeenCalledWith(file);

    await act(async () => root.unmount());
    container.remove();
  });
});
