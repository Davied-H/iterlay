// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n";
import { loadUiTextCatalog } from "../src/i18n/ui-text";
import { FeedbackWidget } from "../src/components/feedback/FeedbackWidget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

beforeEach(() => { localStorage.clear(); document.documentElement.lang = "zh-CN"; });

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  document.body.querySelectorAll("[data-radix-portal]").forEach((node) => node.remove());
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("FeedbackWidget", () => {
  it("localizes the dock label, feedback options, placeholders in English", async () => {
    await loadUiTextCatalog();
    localStorage.setItem("iterlay:language", "en-US");
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root?.render(createElement(I18nProvider, null, createElement(FeedbackWidget, { view: "board" }))));
    expect(document.body.querySelector("[data-feedback-edge-text]")?.textContent).toBe("Feedback");
    await act(async () => document.querySelector('[aria-label="Send feedback"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.body.textContent).toContain("Experience issue");
    expect(document.body.textContent).toContain("Feature request");
    expect(document.querySelector("textarea")?.placeholder).toBe("Describe the issue and what you expected to happen");
    const feature = document.body.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]')!;
    await act(async () => feature.click());
    expect(document.querySelector("textarea")?.placeholder).toBe("Describe the feature you would like and the problem it would solve");
  });

  it("shows recurring, rotating feedback nudges after inactivity", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback: vi.fn() } });
    await renderWidget({ view: "board" });

    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]');
    expect(entry?.dataset.feedbackDocked).toBe("false");
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(entry?.dataset.feedbackDocked).toBe("true");
    await act(async () => { vi.advanceTimersByTime(57_000); });
    expect(entry?.dataset.feedbackDocked).toBe("false");

    expect(document.body.textContent).toContain("哪一步不顺手？");
    expect(document.body.textContent).toContain("在 GitHub Issues 告诉我们");
    expect(document.body.textContent).not.toContain("Credit");
    expect(localStorage.getItem("iterlay:feedback-incentive-nudge:v1")).not.toBeNull();

    await clickButtonByLabel("关闭反馈提示");
    expect(document.body.textContent).not.toContain("哪一步不顺手？");

    await act(async () => {
      vi.advanceTimersByTime(10 * 60 * 1_000);
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(60_000);
    });

    expect(document.body.textContent).toContain("一个好点子，值得被看见");
    expect(document.body.textContent).toContain("提交点子");
  });

  it("redocks three seconds after a brief hover that never opens the guide", async () => {
    vi.useFakeTimers();
    await renderWidget({ view: "board" });
    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]')!;
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(entry.dataset.feedbackDocked).toBe("true");

    await act(async () => entry.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    await act(async () => { vi.advanceTimersByTime(100); });
    await act(async () => entry.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
    expect(entry.dataset.feedbackDocked).toBe("false");
    await act(async () => { vi.advanceTimersByTime(2_999); });
    expect(entry.dataset.feedbackDocked).toBe("false");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(entry.dataset.feedbackDocked).toBe("true");
    expect(document.body.textContent).not.toContain("哪一步不顺手？");
  });

  it("redocks after the hover guide closes", async () => {
    vi.useFakeTimers();
    await renderWidget({ view: "board" });
    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]')!;
    await act(async () => entry.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    await act(async () => { vi.advanceTimersByTime(220); });
    expect(document.body.textContent).toContain("哪一步不顺手？");
    await act(async () => entry.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
    await act(async () => { vi.advanceTimersByTime(120); });
    await act(async () => { vi.advanceTimersByTime(2_999); });
    expect(entry.dataset.feedbackDocked).toBe("false");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(entry.dataset.feedbackDocked).toBe("true");
  });

  it("snaps and immediately docks a manually dragged entry only within the edge range", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback: vi.fn() } });
    await renderWidget({ view: "board" });

    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]');
    if (!entry) throw new Error("missing feedback entry");
    Object.defineProperties(entry, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() }
    });

    await dispatchPointer(entry, "pointerdown", { pointerId: 1, clientX: 956, clientY: 720, button: 0 });
    await dispatchPointer(entry, "pointermove", { pointerId: 1, clientX: 68, clientY: 300, button: 0 });
    await dispatchPointer(entry, "pointerup", { pointerId: 1, clientX: 68, clientY: 300, button: 0 });

    expect(entry.style.left).toBe("0px");
    expect(entry.dataset.feedbackDockSide).toBe("left");
    expect(localStorage.getItem("iterlay:feedback-widget-position:v1")).toBe(JSON.stringify({ x: 0, y: 304 }));
    expect(entry.dataset.feedbackDocked).toBe("true");
    expect(entry.dataset.feedbackDockSide).toBe("left");
    expect(entry.querySelector("[data-feedback-edge-label]")?.className).toContain("left-0");
    expect(entry.querySelector("[data-feedback-edge-label]")?.textContent).toBe("反馈");

    await act(async () => entry.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(entry.style.left).toBe("0px");
    expect(entry.dataset.feedbackDocked).toBe("false");
  });

  it("keeps a manually dragged entry free when it is outside the edge range", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback: vi.fn() } });
    await renderWidget({ view: "board" });

    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]');
    if (!entry) throw new Error("missing feedback entry");
    Object.defineProperties(entry, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() }
    });

    await dispatchPointer(entry, "pointerdown", { pointerId: 1, clientX: 956, clientY: 720, button: 0 });
    await dispatchPointer(entry, "pointermove", { pointerId: 1, clientX: 500, clientY: 300, button: 0 });
    await dispatchPointer(entry, "pointerup", { pointerId: 1, clientX: 500, clientY: 300, button: 0 });

    expect(entry.style.left).toBe("476px");
    expect(entry.dataset.feedbackDocked).toBe("false");
    expect(localStorage.getItem("iterlay:feedback-widget-position:v1")).toBe(JSON.stringify({ x: 476, y: 304 }));
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(entry.dataset.feedbackDocked).toBe("false");
  });

  it("uses a compact, explicit feedback control without shrinking its hit target", async () => {
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback: vi.fn() } });
    await renderWidget({ view: "board" });

    const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]');
    const control = entry?.querySelector<HTMLElement>("[data-feedback-control]");
    const edgeLabel = entry?.querySelector<HTMLElement>("[data-feedback-edge-label]");
    const edgeText = edgeLabel?.querySelector<HTMLElement>("[data-feedback-edge-text]");
    expect(entry?.className).toContain("h-14");
    expect(entry?.className).toContain("w-12");
    expect(control?.className).toContain("inset-0");
    expect(control?.querySelector("svg")).not.toBeNull();
    expect(control?.contains(edgeLabel ?? null)).toBe(true);
    expect(edgeText?.className).toContain("flex-col");
    expect(edgeText?.textContent).toBe("反馈");
    expect((edgeText?.firstElementChild as HTMLElement).style.writingMode).toBe("vertical-rl");
  });

  it("keeps the selected feedback type visually explicit", async () => {
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback: vi.fn() } });
    await renderWidget({ view: "board" });

    await openDialog();
    const experience = findRadio("体验问题");
    const feature = findRadio("新功能");
    const indicator = document.body.querySelector<HTMLElement>("[data-feedback-kind-indicator]");
    const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");

    expect(experience.getAttribute("aria-checked")).toBe("true");
    expect(experience.className).toContain("text-background");
    expect(experience.querySelector("svg")?.className.baseVal).toContain("opacity-100");
    expect(indicator?.style.transform).toBe("translate3d(0%, 0, 0)");
    expect(textarea?.placeholder).toBe("描述你遇到的问题，以及你期待的结果");
    expect(textarea?.className).toContain("transition-[border-color,box-shadow]");
    expect(textarea?.className).toContain("focus-visible:border-foreground/55");
    expect(textarea?.className).toContain("focus-visible:ring-foreground/10");
    expect(textarea?.className).not.toContain("focus-visible:border-ring");
    expect(textarea?.className).toContain("min-h-52");
    expect([...document.body.querySelectorAll<HTMLElement>("[data-feedback]")]
      .some((element) => element.className.includes("max-w-xl"))).toBe(true);
    expect(document.body.textContent).not.toContain("取消");
    expect(document.body.querySelector("[data-feedback-input]")?.textContent).toContain("前往 GitHub 提交");

    await clickButton("新功能");

    expect(experience.getAttribute("aria-checked")).toBe("false");
    expect(experience.className).not.toContain("text-background");
    expect(feature.getAttribute("aria-checked")).toBe("true");
    expect(feature.className).toContain("text-background");
    expect(feature.querySelector("svg")?.className.baseVal).toContain("opacity-100");
    expect(indicator?.style.transform).toBe("translate3d(100%, 0, 0)");
    expect(textarea?.placeholder).toBe("描述你希望增加的功能，以及它能解决什么问题");
  });

  it("prefills a GitHub issue without Manager submission or private board details and keeps the draft", async () => {
    const submitFeedback = vi.fn();
    Object.defineProperty(window, "imageWorkbench", { configurable: true, value: { submitFeedback } });
    await renderWidget({ boardId: "private-board-1", boardName: "私密新品画板", view: "board" });
    await openDialog();
    await clickButton("新功能");
    await changeTextarea("希望支持批量导出 & 图片\n保留原始尺寸");

    const link = findIssueLink();
    expect(link.getAttribute("aria-disabled")).toBe("false");
    const url = new URL(link.href);
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/Davied-H/iterlay/issues/new");
    expect(url.searchParams.get("title")).toBe("[功能建议] 希望支持批量导出 & 图片");
    expect(url.searchParams.get("body")).toContain("保留原始尺寸");
    expect(url.searchParams.get("body")).not.toContain("私密新品画板");
    expect(url.searchParams.get("body")).not.toContain("private-board-1");
    expect(document.body.textContent).toContain("需登录 GitHub 并确认提交");
    expect(submitFeedback).not.toHaveBeenCalled();
    expect(localStorage.getItem("iterlay:feedback-draft:v1")).toContain("希望支持批量导出");
    expect(document.body.textContent).not.toContain("提交成功");
    expect(document.body.querySelector('a[aria-label="查看 GitHub Issues"]')?.getAttribute("href"))
      .toBe("https://github.com/Davied-H/iterlay/issues");
  });

  it("keeps the GitHub link disabled for blank or too-short feedback", async () => {
    await renderWidget({ view: "board" });
    await openDialog();
    await changeTextarea("  好  ");
    expect(findIssueLink().getAttribute("href")).toBeNull();
    expect(findIssueLink().getAttribute("aria-disabled")).toBe("true");
  });

  it("requires copying long feedback intact before opening GitHub", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await renderWidget({ view: "board" });
    await openDialog();
    const longContent = "长反馈内容".repeat(400);
    await changeTextarea(longContent);
    expect(findIssueLink().getAttribute("href")).toBeNull();
    await clickButton("复制完整反馈");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(longContent));
    expect(findIssueLink().getAttribute("aria-disabled")).toBe("false");
    expect(findIssueLink().href.length).toBeLessThan(7_500);
    expect(localStorage.getItem("iterlay:feedback-draft:v1")).toContain(longContent);
    await changeTextarea(longContent + "修改");
    expect(findIssueLink().getAttribute("href")).toBeNull();
  });

  it("keeps long drafts editable and shows clipboard failures", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
    });
    await renderWidget({ view: "library" });
    await openDialog();
    const content = "反馈内容".repeat(500);
    await changeTextarea(content);
    await clickButton("复制完整反馈");
    expect(document.body.textContent).toContain("无法复制");
    expect(document.body.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(content);
    expect(findIssueLink().getAttribute("href")).toBeNull();
  });
});

async function renderWidget(props: { boardId?: string; boardName?: string; view: string }): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(FeedbackWidget, props)));
}

async function openDialog(): Promise<void> {
  const entry = document.body.querySelector<HTMLButtonElement>('[aria-label="提交反馈"]');
  await act(async () => entry?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

async function clickButton(label: string): Promise<void> {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`missing button: ${label}`);
  await act(async () => button.click());
}

async function clickButtonByLabel(label: string): Promise<void> {
  const button = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`missing button with label: ${label}`);
  await act(async () => button.click());
}

function findRadio(label: string): HTMLButtonElement {
  const radio = [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!radio) throw new Error(`missing radio: ${label}`);
  return radio;
}

async function changeTextarea(value: string): Promise<void> {
  const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("missing feedback textarea");
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function dispatchPointer(
  target: HTMLElement,
  type: string,
  init: MouseEventInit & { pointerId: number }
): Promise<void> {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  await act(async () => target.dispatchEvent(event));
}

function findIssueLink(): HTMLAnchorElement {
  const link = [...document.body.querySelectorAll<HTMLAnchorElement>("a")]
    .find((candidate) => candidate.textContent?.trim() === "前往 GitHub 提交");
  if (!link) throw new Error("missing GitHub issue link");
  return link;
}
