// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ParticleBurst,
  getParticleCanvasRegion,
  getParticleTargetCenter
} from "@/components/canvas/ParticleBurst";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("particle burst target", () => {

  it("reads the generated node's current viewport center on every lookup", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    node.dataset.id = "generated-1";
    let left = 40;
    let top = 80;
    node.getBoundingClientRect = () =>
      ({ left, top, width: 200, height: 120 }) as DOMRect;
    document.body.appendChild(node);

    expect(getParticleTargetCenter("generated-1")).toEqual({ x: 140, y: 140 });

    left = 340;
    top = 220;
    expect(getParticleTargetCenter("generated-1")).toEqual({ x: 440, y: 280 });
  });

  it("does not fall back to another image when the generated node is unavailable", () => {
    const reference = document.createElement("div");
    reference.className = "react-flow__node";
    reference.dataset.id = "reference-1";
    reference.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 100 }) as DOMRect;
    document.body.appendChild(reference);

    expect(getParticleTargetCenter("generated-1")).toBeUndefined();
  });

  it("crops dispersing particles to the affected viewport region", () => {
    expect(getParticleCanvasRegion(
      { left: 400, top: 600, width: 300, height: 120 },
      undefined,
      { width: 1440, height: 900 },
      false
    )).toEqual({ left: 280, top: 360, width: 540, height: 480 });
  });

  it("keeps a full canvas while waiting for a target that is not mounted", () => {
    expect(getParticleCanvasRegion(
      { left: 400, top: 600, width: 300, height: 120 },
      undefined,
      { width: 1440, height: 900 },
      true
    )).toEqual({ left: 0, top: 0, width: 1440, height: 900 });
  });

  it("reports completion when no drawable particles are produced, so the trigger cannot replay on remount", async () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) }))
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const onComplete = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ParticleBurst, {
        trigger: {
          text: "生成海报",
          rect: { left: 10, top: 10, width: 200, height: 40 },
          color: "23,23,23",
          nonce: 7
        },
        onComplete
      }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(7);
  });
});
