// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTION_POINTS_HIDE_DELAY_MS,
  useDelayedConnectionPoints
} from "@/components/canvas/use-delayed-connection-points";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function Harness(): React.ReactElement {
  const connectionPoints = useDelayedConnectionPoints();
  return createElement(
    "div",
    { "data-visible": connectionPoints.visible ? "true" : "false" },
    createElement("button", { onClick: connectionPoints.showConnectionPoints }, "show"),
    createElement("button", { onClick: connectionPoints.scheduleConnectionPointsHide }, "hide")
  );
}

describe("useDelayedConnectionPoints", () => {
  it("keeps connection points visible for 1.5 seconds after leave", () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(Harness)));

    act(() => container?.querySelector<HTMLButtonElement>("button")?.click());
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("true");

    act(() => container?.querySelectorAll<HTMLButtonElement>("button")[1]?.click());
    act(() => vi.advanceTimersByTime(CONNECTION_POINTS_HIDE_DELAY_MS - 1));
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("true");

    act(() => vi.advanceTimersByTime(1));
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("false");
  });

  it("cancels a pending hide when the pointer returns", () => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(Harness)));
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");

    act(() => buttons[0]?.click());
    act(() => buttons[1]?.click());
    act(() => vi.advanceTimersByTime(1_000));
    act(() => buttons[0]?.click());
    act(() => vi.advanceTimersByTime(CONNECTION_POINTS_HIDE_DELAY_MS));

    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("true");
  });
});
