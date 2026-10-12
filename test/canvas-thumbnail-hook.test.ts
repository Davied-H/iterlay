// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasThumbnail } from "@/components/canvas/use-canvas-thumbnail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const thumbnailMocks = vi.hoisted(() => ({
  peek: vi.fn<(path: string, size: 192 | 480) => string | undefined>(),
  request: vi.fn()
}));

vi.mock("@/components/canvas/canvas-thumbnails", () => ({
  peekCanvasThumbnail: thumbnailMocks.peek,
  requestCanvasThumbnail: thumbnailMocks.request
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Harness({
  path,
  fallback,
  fallbackOnError
}: {
  path?: string;
  fallback?: string;
  fallbackOnError?: boolean;
}): React.ReactElement {
  const url = useCanvasThumbnail(path, fallback, 192, fallbackOnError);
  return createElement("div", { "data-thumbnail": url });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  thumbnailMocks.peek.mockReset();
  thumbnailMocks.request.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("useCanvasThumbnail", () => {
  it("waits for a 192 thumbnail instead of exposing a full persisted source fallback", async () => {
    let resolveThumbnail: (url: string | undefined) => void = () => undefined;
    const cancel = vi.fn();
    thumbnailMocks.request.mockReturnValue({
      promise: new Promise<string | undefined>((resolve) => { resolveThumbnail = resolve; }),
      cancel
    });

    await act(async () => root?.render(createElement(Harness, {
      path: "/managed/full.png",
      fallback: "data:image/png;base64,full"
    })));

    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBeNull();
    expect(thumbnailMocks.request).toHaveBeenCalledWith("/managed/full.png", 192);

    await act(async () => resolveThumbnail("asset:thumbnail-192"));
    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBe("asset:thumbnail-192");

    await act(async () => root?.unmount());
    expect(cancel).toHaveBeenCalledOnce();
    root = null;
  });

  it("uses data URLs only when no persistent path exists", async () => {
    await act(async () => root?.render(createElement(Harness, {
      fallback: "data:image/png;base64,ephemeral"
    })));

    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBe("data:image/png;base64,ephemeral");
    expect(thumbnailMocks.request).not.toHaveBeenCalled();
  });

  it("does not expose a stale thumbnail while switching paths", async () => {
    thumbnailMocks.peek.mockImplementation((path: string) => (
      path === "/managed/first.png" ? "asset:first-thumbnail" : undefined
    ));
    thumbnailMocks.request.mockReturnValue({
      promise: new Promise<string | undefined>(() => undefined),
      cancel: vi.fn()
    });

    await act(async () => root?.render(createElement(Harness, { path: "/managed/first.png" })));
    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBe("asset:first-thumbnail");

    await act(async () => root?.render(createElement(Harness, { path: "/managed/second.png" })));
    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBeNull();
  });

  it("can fall back after thumbnail generation fails", async () => {
    thumbnailMocks.request.mockReturnValue({
      promise: Promise.resolve(undefined),
      cancel: vi.fn()
    });

    await act(async () => root?.render(createElement(Harness, {
      path: "/managed/unavailable.png",
      fallback: "data:image/png;base64,fallback",
      fallbackOnError: true
    })));

    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBe("data:image/png;base64,fallback");

    thumbnailMocks.peek.mockReturnValue("asset:recovered-thumbnail");
    await act(async () => root?.render(createElement(Harness, {
      path: "/managed/unavailable.png",
      fallback: "data:image/png;base64,fallback",
      fallbackOnError: true
    })));
    expect(host?.firstElementChild?.getAttribute("data-thumbnail")).toBe("asset:recovered-thumbnail");
  });
});
