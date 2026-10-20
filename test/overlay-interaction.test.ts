// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { OverlayInteractionProvider } from "../src/components/ui/overlay-interaction";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../src/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../src/components/ui/popover";
import { CreateChatPage } from "../src/components/workbench/CreateChatPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("covered workspace interactions", () => {
  it.each(["menu", "popover"] as const)("closes a canvas %s when its workspace is covered and keeps it closed on return", async (kind) => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    function Harness({ interactive }: { interactive: boolean }) {
      const [open, setOpen] = useState(true);
      return createElement(OverlayInteractionProvider, { value: interactive },
        kind === "menu" ? createElement(DropdownMenu, { open, onOpenChange: setOpen },
          createElement(DropdownMenuTrigger, null, "底层模型"),
          createElement(DropdownMenuContent, null, createElement(DropdownMenuItem, null, "画布视频模型")))
        : createElement(Popover, { open, onOpenChange: setOpen },
          createElement(PopoverTrigger, null, "底层参数"), createElement(PopoverContent, null, "画布生成参数")));
    }
    try {
      await act(async () => root.render(createElement(Harness, { interactive: true })));
      expect(document.querySelector(kind === "menu" ? '[role="menu"]' : '[role="dialog"]')).not.toBeNull();
      await act(async () => root.render(createElement(Harness, { interactive: false })));
      expect(document.querySelector(kind === "menu" ? '[role="menu"]' : '[role="dialog"]')).toBeNull();
      await act(async () => root.render(createElement(Harness, { interactive: true })));
      expect(document.querySelector(kind === "menu" ? '[role="menu"]' : '[role="dialog"]')).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("shows the creation model button and applies the selected image provider/model", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const select = vi.fn();
    try {
      await act(async () => root.render(createElement(CreateChatPage, {
        boards: [], imageProviders: [{ id: "image", name: "Image service", type: "openai-compatible", model: "model-a", models: ["model-a", "model-b"],
          apiMode: "images", baseUrl: "http://localhost", generationEndpoint: "/images/generations", supportsReferenceImages: true }],
        activeImageProviderId: "image", activeImageModel: "model-a", onSelectImageModel: select,
        onInterpret: vi.fn(), onCreate: vi.fn(), onOpenBoard: vi.fn(), onOpenSettings: vi.fn()
      })));
      const button = container.querySelector<HTMLButtonElement>('[aria-label="选择图片模型"]')!;
      expect(button.textContent).toContain("model-a");
      expect(button.closest(".create-chat-composer-toolbar")).not.toBeNull();
      await act(async () => { button.focus(); button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
      const option = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === "model-b");
      expect(option).toBeDefined();
      await act(async () => option!.click());
      expect(select).toHaveBeenCalledWith("image", "model-b");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
