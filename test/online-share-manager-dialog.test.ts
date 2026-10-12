// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getActiveOnlineShare: vi.fn(),
  stopOnlineShare: vi.fn()
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR")
  }
}));

vi.mock("@/lib/image-workbench-api", () => ({
  getImageWorkbenchApi: () => apiMocks,
  getWorkbenchErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { OnlineShareManagerDialog } from "../src/components/workbench/OnlineShareManagerDialog";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.clearAllMocks();
});

async function renderManager(nodeIds: string[], onLocate = vi.fn()): Promise<typeof onLocate> {
  apiMocks.getActiveOnlineShare.mockResolvedValue({
    id: "share-1",
    kind: "image",
    title: "campaign.png",
    url: "https://share.example.com/share-1",
    startedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60_000,
    origin: { boardId: "board-1", nodeIds }
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(OnlineShareManagerDialog, {
      open: true,
      onOpenChange: vi.fn(),
      onLocate
    }));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return onLocate;
}

describe("OnlineShareManagerDialog", () => {
  it("returns to a single shared image", async () => {
    const onLocate = await renderManager(["node-1"]);
    const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.trim() === "回到分享图片");

    expect(document.body.querySelector('[role="dialog"]')?.className).toContain("max-w-2xl");
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(onLocate).toHaveBeenCalledWith({ boardId: "board-1", nodeIds: ["node-1"] });
  });

  it("returns to the board with every shared image selected", async () => {
    const onLocate = await renderManager(["node-1", "node-2", "node-3"]);
    const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.trim() === "回到画板并选中 3 张图片");

    expect(document.body.textContent).toContain("3 张图片快速分享");
    expect(button).toBeDefined();
    await act(async () => button?.click());
    expect(onLocate).toHaveBeenCalledWith({
      boardId: "board-1",
      nodeIds: ["node-1", "node-2", "node-3"]
    });
  });
});
