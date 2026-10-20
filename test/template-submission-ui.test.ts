// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneDetail } from "../src/components/workbench/SceneDetail";
import { I18nProvider } from "../src/i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let props: ComponentProps<typeof SceneDetail>;
const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.setItem("iterlay:language", "zh-CN");
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn()
  })));
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  props = {
    scene: { id: "contribution", name: "海报 & 产品", description: "模板描述", prompt: "私有提示词内容", category: "product", mode: "generate", useCase: "product-mockup", source: "custom" },
    isFavorite: false, boards: [], history: [], canOptimize: false,
    generationDefaults: { providerId: "offline", providerName: "离线测试", model: "offline", size: "auto", canGenerate: false, supportsEditing: false },
    onBack: vi.fn(), onApply: vi.fn(), onToggleFavorite: vi.fn(), onEdit: vi.fn(),
    onExport: vi.fn(), onCollaborate: vi.fn(), onCopyText: vi.fn(),
    onLocateHistory: vi.fn(), onReuseHistory: vi.fn(), onUseHistoryAsReference: vi.fn(),
    loadThumbnail: vi.fn(async () => undefined), onMediaChange: vi.fn(async () => undefined), onOpenSettings: vi.fn()
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.removeItem("iterlay:language");
  vi.unstubAllGlobals();
});

async function openContribution(): Promise<HTMLElement> {
  await act(async () => root.render(createElement(I18nProvider, null, createElement(SceneDetail, props))));
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="通过 GitHub 投稿模板"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}

describe("template contribution UI", () => {
  it("opens a public GitHub draft without submitting a template or its private prompt", async () => {
    const dialog = await openContribution();
    expect(dialog.textContent).toContain("压缩为 ZIP");
    expect(dialog.textContent).toContain("投稿内容会公开");
    const link = dialog.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe("https://github.com/Davied-H/iterlay/issues/new");
    expect(url.searchParams.get("title")).toBe("[模板投稿] 海报 & 产品");
    expect(decodeURIComponent(url.href)).not.toContain(props.scene.prompt);
    expect(link.rel).toBe("noopener noreferrer");
    expect(props.onExport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exports the current template only after the user selects export", async () => {
    const dialog = await openContribution();
    const button = [...dialog.querySelectorAll("button")].find((element) => element.textContent === "导出模板");
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onExport).toHaveBeenCalledWith(props.scene);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
