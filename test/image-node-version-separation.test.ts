// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDelayedVersionSeparation
} from "../src/components/canvas/image-node/ImageNodeVersions";
import type {
  GeneratedImage,
  VersionSeparationPlacement
} from "../src/components/canvas/image-node-model";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SeparateCallback = (
  imageId: string,
  versionIndex: number | undefined,
  placement: VersionSeparationPlacement
) => void;

const placement: VersionSeparationPlacement = {
  position: { x: 20, y: 30 },
  previewIndex: 1
};

function image(id: string): GeneratedImage {
  return { id, path: `/${id}.png`, dataUrl: `data:${id}`, jobId: `job-${id}` };
}

function Harness({
  imageValue,
  callback,
  expose
}: {
  imageValue: GeneratedImage;
  callback?: SeparateCallback;
  expose: (schedule: ReturnType<typeof useDelayedVersionSeparation>) => void;
}): null {
  expose(useDelayedVersionSeparation(imageValue, callback));
  return null;
}

describe("image node delayed version separation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("cancels the pending callback when the node unmounts", async () => {
    const callback = vi.fn<SeparateCallback>();
    const onSettled = vi.fn();
    let schedule: ReturnType<typeof useDelayedVersionSeparation> | undefined;
    await act(async () => root.render(createElement(Harness, {
      imageValue: image("image-1"), callback, expose: (value) => { schedule = value; }
    })));

    act(() => schedule?.(1, placement, onSettled));
    await act(async () => root.unmount());
    act(() => vi.advanceTimersByTime(460));

    expect(callback).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith("cancelled");
    root = createRoot(container);
  });

  it("cancels work scheduled for an image that has changed", async () => {
    const callback = vi.fn<SeparateCallback>();
    const onSettled = vi.fn();
    let schedule: ReturnType<typeof useDelayedVersionSeparation> | undefined;
    const expose = (value: ReturnType<typeof useDelayedVersionSeparation>): void => { schedule = value; };
    await act(async () => root.render(createElement(Harness, {
      imageValue: image("image-1"), callback, expose
    })));
    act(() => schedule?.("all", placement, onSettled));

    await act(async () => root.render(createElement(Harness, {
      imageValue: image("image-2"), callback, expose
    })));
    act(() => vi.advanceTimersByTime(460));

    expect(callback).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("cancelled");

    const nextSettled = vi.fn();
    act(() => schedule?.(1, placement, nextSettled));
    act(() => vi.advanceTimersByTime(460));
    expect(callback).toHaveBeenCalledWith("image-2", 1, placement);
    expect(nextSettled).toHaveBeenCalledWith("committed");
  });

  it("does not invoke a stale callback after the callback changes", async () => {
    const oldCallback = vi.fn<SeparateCallback>();
    const nextCallback = vi.fn<SeparateCallback>();
    let schedule: ReturnType<typeof useDelayedVersionSeparation> | undefined;
    const expose = (value: ReturnType<typeof useDelayedVersionSeparation>): void => { schedule = value; };
    const imageValue = image("image-1");
    await act(async () => root.render(createElement(Harness, { imageValue, callback: oldCallback, expose })));
    act(() => schedule?.(1, placement, vi.fn()));

    await act(async () => root.render(createElement(Harness, { imageValue, callback: nextCallback, expose })));
    act(() => vi.advanceTimersByTime(460));

    expect(oldCallback).not.toHaveBeenCalled();
    expect(nextCallback).not.toHaveBeenCalled();
  });

  it("commits after 460 ms with the requested arguments and settles after the callback", async () => {
    const calls: string[] = [];
    const callback = vi.fn<SeparateCallback>(() => { calls.push("callback"); });
    const onSettled = vi.fn(() => { calls.push("settled"); });
    let schedule: ReturnType<typeof useDelayedVersionSeparation> | undefined;
    await act(async () => root.render(createElement(Harness, {
      imageValue: image("image-1"), callback, expose: (value) => { schedule = value; }
    })));

    act(() => schedule?.(1, placement, onSettled));
    act(() => vi.advanceTimersByTime(459));
    expect(callback).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith("image-1", 1, placement);
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith("committed");
    expect(calls).toEqual(["callback", "settled"]);
  });

  it("settles a replaced request and allows a later request to commit", async () => {
    const callback = vi.fn<SeparateCallback>();
    const firstSettled = vi.fn();
    const nextSettled = vi.fn();
    let schedule: ReturnType<typeof useDelayedVersionSeparation> | undefined;
    await act(async () => root.render(createElement(Harness, {
      imageValue: image("image-1"), callback, expose: (value) => { schedule = value; }
    })));

    act(() => schedule?.("all", placement, firstSettled));
    act(() => schedule?.(0, placement, nextSettled));

    expect(firstSettled).toHaveBeenCalledOnce();
    expect(firstSettled).toHaveBeenCalledWith("cancelled");
    act(() => vi.advanceTimersByTime(460));
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith("image-1", 0, placement);
    expect(nextSettled).toHaveBeenCalledWith("committed");
  });
});
