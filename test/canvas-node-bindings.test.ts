// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import {
  useCanvasNodeBindings,
  type CanvasNodeBindingCapabilities,
  type CanvasNodeBindingHandlerFacade
} from "@/components/canvas/use-canvas-node-bindings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: CanvasNodeBindingHandlerFacade | null = null;
let capabilities: CanvasNodeBindingCapabilities;

const artwork: GeneratedImage = {
  id: "image",
  path: "image.png",
  dataUrl: "data:image",
  jobId: "job",
  width: 100,
  height: 100
};

function Harness(): React.ReactElement | null {
  latest = useCanvasNodeBindings(capabilities);
  return null;
}

function requiredCapabilities(overrides: Partial<CanvasNodeBindingCapabilities> = {}): CanvasNodeBindingCapabilities {
  return {
    image: {
      onCopy: vi.fn(),
      onSave: vi.fn(),
      onUseReference: vi.fn(),
      ...overrides.image
    },
    workflow: overrides.workflow ?? {},
    comment: overrides.comment ?? {},
    connection: overrides.connection ?? {},
    layout: overrides.layout ?? {}
  };
}

async function render(strict = false): Promise<void> {
  if (!host) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  const harness = createElement(Harness);
  await act(async () => root?.render(strict ? createElement(StrictMode, null, harness) : harness));
}

beforeEach(() => {
  latest = null;
  capabilities = requiredCapabilities();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("canvas node binding facade", () => {
  it("keeps facade and handler identities while dispatching to the latest capability callbacks", async () => {
    const first = {
      copy: vi.fn(),
      edit: vi.fn(),
      text: vi.fn(),
      comment: vi.fn(),
      connection: vi.fn(),
      resize: vi.fn()
    };
    capabilities = requiredCapabilities({
      image: { onCopy: first.copy, onSave: vi.fn(), onUseReference: vi.fn(), onEdit: first.edit },
      workflow: { onTextChange: first.text },
      comment: { onMoveComment: first.comment },
      connection: { onConnectionHandlePointerDown: first.connection },
      layout: { onResizeEnd: first.resize }
    });
    await render();
    const originalFacade = latest!;
    const originalHandlers = {
      copy: latest!.image.onCopy,
      edit: latest!.image.onEdit,
      text: latest!.workflow.text.onChange,
      comment: latest!.comment.onMoveComment,
      connection: latest!.connection.onConnectionHandlePointerDown,
      resize: latest!.layout.onResizeEnd
    };

    const second = {
      copy: vi.fn(),
      edit: vi.fn(),
      text: vi.fn(),
      comment: vi.fn(),
      connection: vi.fn(),
      resize: vi.fn()
    };
    capabilities = requiredCapabilities({
      image: { onCopy: second.copy, onSave: vi.fn(), onUseReference: vi.fn(), onEdit: second.edit },
      workflow: { onTextChange: second.text },
      comment: { onMoveComment: second.comment },
      connection: { onConnectionHandlePointerDown: second.connection },
      layout: { onResizeEnd: second.resize }
    });
    await render();

    expect(latest).toBe(originalFacade);
    expect(latest!.image.onCopy).toBe(originalHandlers.copy);
    expect(latest!.image.onEdit).toBe(originalHandlers.edit);
    expect(latest!.workflow.text.onChange).toBe(originalHandlers.text);
    expect(latest!.comment.onMoveComment).toBe(originalHandlers.comment);
    expect(latest!.connection.onConnectionHandlePointerDown).toBe(originalHandlers.connection);
    expect(latest!.layout.onResizeEnd).toBe(originalHandlers.resize);

    latest!.image.onCopy();
    latest!.image.onEdit?.(artwork);
    latest!.workflow.text.onChange?.("text", "latest");
    latest!.comment.onMoveComment?.("comment", { x: 0.25, y: 0.75 });
    latest!.connection.onConnectionHandlePointerDown?.("node", "right", 10, 20, 7);
    latest!.layout.onResizeEnd?.("image", 320, 240);

    expect(Object.values(first).every((callback) => callback.mock.calls.length === 0)).toBe(true);
    expect(second.copy).toHaveBeenCalledOnce();
    expect(second.edit).toHaveBeenCalledWith(artwork);
    expect(second.text).toHaveBeenCalledWith("text", "latest");
    expect(second.comment).toHaveBeenCalledWith("comment", { x: 0.25, y: 0.75 });
    expect(second.connection).toHaveBeenCalledWith("node", "right", 10, 20, 7);
    expect(second.resize).toHaveBeenCalledWith("image", 320, 240);
  });

  it("preserves optional capability presence without changing an enabled handler on replacement", async () => {
    await render();
    expect(latest!.image.onDelete).toBeUndefined();

    const firstDelete = vi.fn();
    capabilities = requiredCapabilities({
      image: { onCopy: vi.fn(), onSave: vi.fn(), onUseReference: vi.fn(), onDelete: firstDelete }
    });
    await render();
    const handler = latest!.image.onDelete;

    const replacementDelete = vi.fn();
    capabilities = requiredCapabilities({
      image: { onCopy: vi.fn(), onSave: vi.fn(), onUseReference: vi.fn(), onDelete: replacementDelete }
    });
    await render();

    expect(latest!.image.onDelete).toBe(handler);
    latest!.image.onDelete?.(artwork);
    expect(firstDelete).not.toHaveBeenCalled();
    expect(replacementDelete).toHaveBeenCalledWith(artwork);
  });

  it("remains active after Strict Mode effect replay and becomes inert after unmount", async () => {
    const onCopy = vi.fn();
    capabilities = requiredCapabilities({
      image: { onCopy, onSave: vi.fn(), onUseReference: vi.fn() }
    });
    await render(true);
    const handler = latest!.image.onCopy;

    handler();
    expect(onCopy).toHaveBeenCalledOnce();

    await act(async () => root?.unmount());
    root = null;
    handler();
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
