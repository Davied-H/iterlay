// @vitest-environment jsdom

import { act, createElement, forwardRef, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/ImageNode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getJobPrompt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => ({ getJobPrompt })
}));

vi.mock("framer-motion", async () => {
  const { createElement: renderElement, forwardRef: renderForwardRef } = await import("react");
  const makeMotionElement = (tag: "aside" | "div" | "img") =>
    renderForwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
      const rest = { ...props };
      const children = rest.children as ReactNode;
      delete rest.children;
      delete rest.initial;
      delete rest.animate;
      delete rest.exit;
      delete rest.transition;
      return renderElement(tag, { ...rest, ref }, children);
    });

  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => renderElement(Fragment, null, children),
    motion: {
      aside: makeMotionElement("aside"),
      div: makeMotionElement("div"),
      img: makeMotionElement("img")
    },
    useReducedMotion: () => true
  };
});

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  TooltipTrigger: forwardRef<HTMLElement, { children?: ReactNode }>(({ children }, ref) => {
    void ref;
    return createElement(Fragment, null, children);
  })
}));

vi.mock("@/components/workbench/asset/ImageZoomLightbox", () => ({ ImageZoomLightbox: () => null }));
vi.mock("@/components/workbench/asset/VersionCompareSlider", () => ({ VersionCompareSlider: () => null }));

import { EditLightbox } from "../src/components/canvas/EditLightbox";

let container: HTMLDivElement;
let root: Root;

const image: GeneratedImage = {
  id: "image-1",
  path: "/tmp/image.png",
  dataUrl: "data:image/png;base64,AA==",
  jobId: "job-1",
  width: 800,
  height: 600
};

beforeEach(() => {
  getJobPrompt.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderLightbox(renderedImage: GeneratedImage = image): Promise<void> {
  await act(async () => {
    root.render(createElement(EditLightbox, {
      image: renderedImage,
      sourceRect: null,
      infoMode: "flip",
      onSwitchVersion: vi.fn(),
      onDownload: vi.fn(),
      onClose: vi.fn()
    }));
  });
}

describe("EditLightbox prompt affordance", () => {
  it("does not offer or render the flip interaction when the prompt is empty", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "   ", referenceImages: [] });

    await renderLightbox();

    expect(container.textContent).not.toContain("点击查看提示词");
    expect(container.querySelector('[class*="transform-style"]')).toBeNull();
    expect(container.querySelector('[class*="cursor-pointer"]')).toBeNull();
  });

  it("enables the configured flip interaction when a prompt exists", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "保留主体，调整背景光线", referenceImages: [] });

    await renderLightbox();

    expect(container.textContent).toContain("点击查看提示词");
    expect(container.querySelector('[class*="transform-style"]')).not.toBeNull();
  });

  it("shows the source information when only reference images exist", async () => {
    getJobPrompt.mockResolvedValue({
      prompt: "",
      referenceImages: ["data:image/png;base64,UkVG"]
    });

    await renderLightbox();

    expect(container.textContent).toContain("点击查看提示词");
    expect(container.textContent).toContain("引用图片");
    expect(container.querySelector('img[alt="引用图 1"]')?.getAttribute("src")).toBe("data:image/png;base64,UkVG");
  });

  it("clamps long prompts to five lines and expands into a scrollable region", async () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
    getJobPrompt.mockResolvedValue({
      prompt: "这是一段很长的提示词，包含主体、构图、光线、材质、色彩、镜头与输出限制。".repeat(8),
      referenceImages: []
    });

    await renderLightbox();

    const prompt = container.querySelector<HTMLElement>(".line-clamp-5");
    const expandButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("查看更多"));
    expect(prompt).not.toBeNull();
    expect(expandButton).toBeDefined();

    await act(async () => expandButton!.click());

    expect(container.querySelector(".line-clamp-5")).toBeNull();
    expect(container.querySelector(".max-h-52.overflow-y-auto")).not.toBeNull();
    expect(container.textContent).toContain("收起");
  });
});

describe("EditLightbox image dimensions", () => {
  it("shows the current image dimensions", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox();

    expect(container.textContent).toContain("800 × 600 px");
    const badge = container.querySelector('[aria-label="图片尺寸 800 × 600 像素"]');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain("opacity-0");
    expect(badge?.className).toContain("group-hover:opacity-100");
  });

  it("uses the active version dimensions", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox({
      ...image,
      width: 1200,
      height: 1600,
      activeVersion: 1,
      versions: [
        { path: "/tmp/v1.png", dataUrl: "data:image/png;base64,VjE=", jobId: "job-1", width: 800, height: 600 },
        { path: "/tmp/v2.png", dataUrl: "data:image/png;base64,VjI=", jobId: "job-2", width: 1200, height: 1600 }
      ]
    });

    expect(container.textContent).toContain("1200 × 1600 px");
    expect(container.textContent).not.toContain("800 × 600 px");
  });

  it("falls back to the loaded image's natural dimensions", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox({ ...image, width: undefined, height: undefined });
    const preview = container.querySelector<HTMLImageElement>('img[alt="正在编辑的图片"]');
    expect(preview).not.toBeNull();
    Object.defineProperties(preview!, {
      naturalWidth: { configurable: true, value: 2048 },
      naturalHeight: { configurable: true, value: 1152 }
    });

    await act(async () => preview!.dispatchEvent(new Event("load", { bubbles: true })));

    expect(container.textContent).toContain("2048 × 1152 px");
  });
});

describe("EditLightbox tools", () => {
  it("keeps the floating edit tools legible over the dimmed canvas", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox();

    const tools = container.querySelector<HTMLElement>('[data-tour="edit-tools"]');
    expect(tools?.className).toContain("bg-background");
    expect(tools?.className).toContain("shadow-md");
    expect(tools?.querySelector('[aria-label="下载当前图片"]')?.className).toContain("text-foreground/80");
    expect(tools?.querySelector('[aria-label="放大预览"]')?.className).toContain("text-foreground/80");
  });
});

describe("EditLightbox pending edit versions", () => {
  it("renders one loading version for each concurrent edit", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox({
      ...image,
      editing: true,
      pendingEditCount: 2,
      editingStartedAt: Date.now()
    });

    expect(container.querySelectorAll('[aria-label^="新版本"][aria-label$="正在生成"]')).toHaveLength(2);
  });

  it("shows queued edit versions without starting their elapsed timer", async () => {
    getJobPrompt.mockResolvedValue({ prompt: "", referenceImages: [] });

    await renderLightbox({
      ...image,
      editing: true,
      pendingEditCount: 2,
      queuedEditCount: 2
    });

    expect(container.textContent).toContain("编辑任务排队中");
    expect(container.textContent).toContain("已有 3 个任务正在处理");
    expect(container.querySelectorAll('[aria-label^="新版本"][aria-label$="排队中"]')).toHaveLength(2);
    expect(container.textContent).not.toContain("预计剩余");
  });
});
