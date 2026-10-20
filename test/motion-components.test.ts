// @vitest-environment jsdom
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RotatingText, { type RotatingTextRef } from "../src/components/onboarding/RotatingText";
import { ReactBitsStack } from "../src/components/workbench/gallery/ReactBitsStack";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("shared framer-motion components", () => {
  it("preserves rotating-text navigation, clamping and reset with real motion components", async () => {
    const ref = createRef<RotatingTextRef>();
    const onNext = vi.fn();
    await act(async () => root.render(createElement(RotatingText, {
      ref, texts: ["第一项", "第二项", "第三项"], auto: false,
      initial: false, animatePresenceMode: "sync", transition: { duration: 0 }, onNext
    })));
    const currentText = (): string | null | undefined => container.querySelector(".text-rotate-sr-only")?.textContent;
    expect(currentText()).toBe("第一项");
    await act(async () => ref.current!.next());
    expect(currentText()).toBe("第二项");
    await act(async () => ref.current!.jumpTo(100));
    expect(currentText()).toBe("第三项");
    await act(async () => ref.current!.next());
    expect(currentText()).toBe("第一项");
    await act(async () => ref.current!.previous());
    expect(currentText()).toBe("第三项");
    await act(async () => ref.current!.reset());
    expect(currentText()).toBe("第一项");
    expect(onNext.mock.calls.map(([index]) => index)).toEqual([1, 2, 0, 2, 0]);
  });

  it("preserves stack reordering and reduced-motion drag suppression", async () => {
    const onTopCardChange = vi.fn();
    await act(async () => root.render(createElement(ReactBitsStack, {
      cards: [createElement("span", { key: "a" }, "A"), createElement("span", { key: "b" }, "B")],
      sendToBackOnClick: true, reduceMotion: true, onTopCardChange
    })));
    expect(onTopCardChange).toHaveBeenLastCalledWith(1);
    expect(container.querySelectorAll(".card-rotate-disabled")).toHaveLength(2);
    const top = container.querySelectorAll<HTMLElement>(".card")[1];
    await act(async () => top.click());
    expect(onTopCardChange).toHaveBeenLastCalledWith(0);
    expect([...container.querySelectorAll(".card")].map((card) => card.textContent)).toEqual(["B", "A"]);
  });

  it("pauses automatic stack changes while hovered and stops timers on unmount", async () => {
    vi.useFakeTimers();
    const onTopCardChange = vi.fn();
    await act(async () => root.render(createElement(ReactBitsStack, {
      cards: [createElement("span", { key: "a" }, "A"), createElement("span", { key: "b" }, "B")],
      autoplay: true, autoplayDelay: 100, pauseOnHover: true, reduceMotion: true, onTopCardChange
    })));
    await act(async () => vi.advanceTimersByTime(100));
    expect(onTopCardChange).toHaveBeenLastCalledWith(0);
    const stack = container.querySelector<HTMLElement>(".stack-container")!;
    await act(async () => stack.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    onTopCardChange.mockClear();
    await act(async () => vi.advanceTimersByTime(300));
    expect(onTopCardChange).not.toHaveBeenCalled();
    await act(async () => stack.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(100));
    expect(onTopCardChange).toHaveBeenLastCalledWith(1);
    await act(async () => root.render(null));
    onTopCardChange.mockClear();
    await act(async () => vi.advanceTimersByTime(500));
    expect(onTopCardChange).not.toHaveBeenCalled();
  });
});
