import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  planCanvasShortcut,
  type CanvasShortcutKeyInput,
  type CanvasShortcutSnapshot
} from "@/components/canvas/canvas-shortcut-plan";
import type { GeneratedImage } from "@/components/canvas/image-node-model";

const ALL_ASSET_ACTIONS = new Set([
  "edit",
  "slice",
  "view-details",
  "save-as-template",
  "export-wechat",
  "quick-share",
  "remove-background",
  "switch-version"
] as const);

const BASE_INPUT: CanvasShortcutKeyInput = {
  key: "",
  commandKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  isComposing: false,
  repeat: false,
  editableTarget: false
};

function image(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    id: "image-1",
    jobId: "job-1",
    path: "/tmp/image.png",
    dataUrl: "data:image/png;base64,AAAA",
    width: 100,
    height: 100,
    ...overrides
  };
}

function imageNode(value = image(), selected = true): Node {
  return { id: value.id, type: "imageNode", position: { x: 0, y: 0 }, selected, data: { image: value } };
}

function workflowNode(selected = true): Node {
  return { id: "workflow-1", type: "textNode", position: { x: 0, y: 0 }, selected, data: {} };
}

function snapshot(overrides: Partial<CanvasShortcutSnapshot> = {}): CanvasShortcutSnapshot {
  return {
    enabled: true,
    commentMode: false,
    gestureActive: false,
    canAddReferences: true,
    availableAssetActions: ALL_ASSET_ACTIONS,
    nodes: [],
    edges: [],
    ...overrides
  };
}

function plan(
  input: Partial<CanvasShortcutKeyInput>,
  state: Partial<CanvasShortcutSnapshot> = {}
) {
  return planCanvasShortcut({ ...BASE_INPUT, ...input }, snapshot(state));
}

describe("canvas shortcut planning", () => {
  it("prioritizes Delete and Backspace selection deletion", () => {
    const node = workflowNode();
    const edge = { id: "edge-1", source: "a", target: "b", selected: true } as Edge;
    expect(plan({ key: "Delete", commandKey: true }, { nodes: [node], edges: [edge] })).toEqual({
      type: "command",
      command: { type: "delete", nodes: [node], connectionIds: ["edge-1"] },
      preventDefault: true
    });
    expect(plan({ key: "Backspace" }, { edges: [edge] })).toMatchObject({
      type: "command",
      command: { type: "delete", connectionIds: ["edge-1"] }
    });
  });

  it("defers Escape to a gesture, then clears selection or exits", () => {
    expect(plan({ key: "Escape" }, { gestureActive: true })).toEqual({ type: "defer" });
    expect(plan({ key: "Escape" }, { nodes: [workflowNode()] })).toMatchObject({
      type: "command",
      command: { type: "clear-selection" }
    });
    expect(plan({ key: "Escape" })).toMatchObject({
      type: "command",
      command: { type: "exit-canvas" }
    });
  });

  it.each([
    ["select all", { key: "a", commandKey: true }],
    ["undo", { key: "z", commandKey: true }],
    ["duplicate", { key: "d", commandKey: true }],
    ["copy original", { key: "c", commandKey: true, shiftKey: true }],
    ["reference", { key: "r" }],
    ["edit", { key: "e" }],
    ["switch version", { key: "[" }]
  ])("lets %s through without executing while comment mode owns the canvas", (_label, input) => {
    const versioned = image({
      activeVersion: 1,
      versions: [
        { jobId: "v1", path: "/tmp/v1.png", dataUrl: "one" },
        { jobId: "v2", path: "/tmp/v2.png", dataUrl: "two" }
      ]
    });
    expect(plan(input, { commentMode: true, nodes: [imageNode(versioned)] })).toEqual({ type: "ignore" });
  });

  it("keeps non-mutating navigation commands available in comment mode", () => {
    const selected = workflowNode();
    expect(plan({ key: "Escape" }, { commentMode: true, nodes: [selected] })).toMatchObject({
      command: { type: "clear-selection" }
    });
    expect(plan({ key: "1", shiftKey: true }, { commentMode: true })).toMatchObject({
      command: { type: "fit-canvas" }
    });
    expect(plan({ key: "2", shiftKey: true }, { commentMode: true, nodes: [selected] })).toMatchObject({
      command: { type: "fit-selection" }
    });
  });

  it.each([
    { enabled: false },
    { input: { editableTarget: true } },
    { input: { isComposing: true } },
    { input: { repeat: true } },
    { input: { defaultPrevented: true } }
  ])("ignores disabled or native-owned input %#", ({ enabled, input }) => {
    expect(plan({ key: "a", commandKey: true, ...input }, { enabled: enabled ?? true })).toEqual({ type: "ignore" });
  });

  it("plans selection, history, and viewport commands", () => {
    const selected = workflowNode();
    expect(plan({ key: "a", commandKey: true })).toMatchObject({ command: { type: "select-all" } });
    expect(plan({ key: "z", commandKey: true })).toMatchObject({ command: { type: "undo" } });
    expect(plan({ key: "z", commandKey: true, shiftKey: true })).toMatchObject({ command: { type: "redo" } });
    expect(plan({ key: "1", shiftKey: true })).toMatchObject({ command: { type: "fit-canvas" } });
    expect(plan({ key: "2", shiftKey: true }, { nodes: [selected] })).toMatchObject({
      command: { type: "fit-selection", nodes: [selected] }
    });
    expect(plan({ key: "2", shiftKey: true })).toEqual({
      type: "reject",
      message: "请先选择要查看的图片",
      preventDefault: false
    });
  });

  it("plans duplicate, copy-original, and reference qualifications", () => {
    const ready = imageNode();
    expect(plan({ key: "d", commandKey: true }, { nodes: [ready] })).toMatchObject({
      command: { type: "duplicate", nodes: [ready] }
    });
    expect(plan({ key: "c", commandKey: true, shiftKey: true }, { nodes: [ready] })).toMatchObject({
      command: { type: "copy-original" }
    });
    expect(plan({ key: "c", commandKey: true, shiftKey: true })).toEqual({
      type: "reject",
      message: "请先选择一张图片",
      preventDefault: true
    });
    expect(plan({ key: "r" }, { nodes: [ready], canAddReferences: false })).toEqual({
      type: "reject",
      message: "参考图已达 4 张上限",
      preventDefault: true
    });
  });

  it.each([
    ["e", "edit"],
    ["s", "slice"],
    ["i", "view-details"],
    ["t", "save-as-template"],
    ["w", "export-wechat"],
    ["h", "quick-share"],
    ["d", "download-original"],
    ["b", "remove-background"]
  ])("plans asset key %s as %s", (key, type) => {
    expect(plan({ key }, { nodes: [imageNode()] })).toMatchObject({ command: { type } });
  });

  it.each([
    ["e", "edit"],
    ["s", "slice"],
    ["i", "view-details"],
    ["t", "save-as-template"],
    ["w", "export-wechat"],
    ["h", "quick-share"],
    ["b", "remove-background"]
  ] as const)("does not claim %s when the %s capability is unavailable", (key, unavailable) => {
    const available = new Set(ALL_ASSET_ACTIONS);
    available.delete(unavailable);
    expect(plan({ key }, {
      nodes: [imageNode()],
      availableAssetActions: available
    })).toEqual({ type: "ignore" });
  });

  it("does not plan version switching when the handler is unavailable", () => {
    const available = new Set(ALL_ASSET_ACTIONS);
    available.delete("switch-version");
    const versioned = image({
      activeVersion: 1,
      versions: [
        { jobId: "v1", path: "/tmp/v1.png", dataUrl: "one" },
        { jobId: "v2", path: "/tmp/v2.png", dataUrl: "two" }
      ]
    });
    expect(plan({ key: "[" }, {
      nodes: [imageNode(versioned)],
      availableAssetActions: available
    })).toEqual({ type: "ignore" });
  });

  it("preserves asset rejection messages and prevent-default semantics", () => {
    expect(plan({ key: "e" })).toEqual({
      type: "reject",
      message: "请先选择一张图片",
      preventDefault: false
    });
    expect(plan({ key: "e" }, { nodes: [imageNode(image({ pending: true }))] })).toMatchObject({
      type: "reject",
      message: "图片生成完成后才能执行此操作"
    });
    expect(plan({ key: "s" }, { nodes: [imageNode(image({ path: "" }))] })).toMatchObject({
      message: "这张图片暂时不能切图"
    });
    expect(plan({ key: "d" }, { nodes: [imageNode(image({ path: "" }))] })).toMatchObject({
      message: "这张图片暂时不能下载"
    });
  });

  it("plans bounded version navigation", () => {
    const versioned = image({
      activeVersion: 1,
      versions: [
        { jobId: "job-v1", path: "/tmp/v1.png", dataUrl: "one" },
        { jobId: "job-v2", path: "/tmp/v2.png", dataUrl: "two" },
        { jobId: "job-v3", path: "/tmp/v3.png", dataUrl: "three" }
      ]
    });
    expect(plan({ key: "[" }, { nodes: [imageNode(versioned)] })).toMatchObject({
      command: { type: "switch-version", imageId: "image-1", index: 0 }
    });
    expect(plan({ key: "]" }, { nodes: [imageNode(versioned)] })).toMatchObject({
      command: { type: "switch-version", imageId: "image-1", index: 2 }
    });
    expect(plan({ key: "[" }, { nodes: [imageNode(image({ activeVersion: 0, versions: versioned.versions }))] })).toEqual({ type: "ignore" });
    expect(plan({ key: "]" }, {
      nodes: [imageNode(image({ pending: true, activeVersion: 0, versions: versioned.versions }))]
    })).toEqual({
      type: "reject",
      message: "图片生成完成后才能执行此操作",
      preventDefault: false
    });
  });
});
