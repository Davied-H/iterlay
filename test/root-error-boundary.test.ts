// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RootErrorBoundary } from "../src/components/system/RootErrorBoundary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  restoreProperty(navigator, "clipboard", originalClipboardDescriptor);
  restoreProperty(document, "execCommand", originalExecCommandDescriptor);
});

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

async function renderCrash(message = "lazy chunk failed"): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const BrokenView = (): never => {
    throw new Error(message);
  };

  await act(async () => {
    root.render(createElement(
      RootErrorBoundary,
      null,
      createElement(BrokenView)
    ));
  });

  return { container, root };
}

function findButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`missing button: ${label}`);
  return button;
}

describe("RootErrorBoundary", () => {
  it("replaces a crashed renderer subtree with a calm recovery screen and error summary", async () => {
    const { container, root } = await renderCrash();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("工作区暂时无法显示");
    expect(alert?.textContent).toContain("已保存的画板仍在本机");
    expect(container.textContent).toContain("lazy chunk failed");
    expect(container.textContent).toMatch(/问题编号 ITR-RDR-[A-Z0-9]{6}/);
    expect(findButton(container, "重新加载")).toBeTruthy();
    expect(findButton(container, "复制诊断信息")).toBeTruthy();
    expect(container.querySelector("details")?.open).toBe(false);

    await act(async () => root.unmount());
  });

  it("copies a sanitized diagnostic report and confirms the action inline", async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const { container, root } = await renderCrash(
      "Request failed at /Users/dong/private.ts?token=super-secret Bearer session-token " +
      "Authorization: private-header data:image/png;base64,ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"
    );

    await act(async () => {
      findButton(container, "复制诊断信息").click();
    });

    expect(writeText).toHaveBeenCalledOnce();
    const report = writeText.mock.calls[0]?.[0] ?? "";
    expect(report).toContain("Iterlay renderer diagnostics");
    expect(report).toContain("App version:");
    expect(report).toContain("~/private.ts?token=[redacted]");
    expect(report).toContain("Bearer [redacted]");
    expect(report).toContain("Authorization: [redacted]");
    expect(report).toContain("data:[redacted]");
    expect(report).not.toContain("super-secret");
    expect(report).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");
    expect(report).not.toContain("/Users/dong");
    expect(container.textContent).toContain("诊断信息已复制，可以直接发给开发者");
    expect(findButton(container, "已复制")).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("falls back to a selectable open report when clipboard copying fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) }
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false)
    });
    const { container, root } = await renderCrash();

    await act(async () => {
      findButton(container, "复制诊断信息").click();
    });

    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.textContent).toContain("复制失败，请在下方手动选择错误详情");

    await act(async () => root.unmount());
  });

  it("uses the textarea fallback when the async clipboard API is unavailable", async () => {
    Reflect.deleteProperty(navigator, "clipboard");
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    const { container, root } = await renderCrash();

    await act(async () => {
      findButton(container, "复制诊断信息").click();
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(container.textContent).toContain("诊断信息已复制，可以直接发给开发者");
    expect(document.querySelector("textarea")).toBeNull();

    await act(async () => root.unmount());
  });
});
