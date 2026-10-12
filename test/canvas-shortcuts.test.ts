import { describe, expect, it } from "vitest";
import { resolveCanvasShortcut } from "../src/components/canvas/canvas-shortcuts";

function shortcut(
  key: string,
  overrides: Partial<Parameters<typeof resolveCanvasShortcut>[0]> = {}
) {
  return resolveCanvasShortcut({
    key,
    commandKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  });
}

describe("canvas shortcuts", () => {
  it("maps direct canvas actions", () => {
    expect(shortcut("e")).toBe("edit");
    expect(shortcut("R")).toBe("reference");
    expect(shortcut("s")).toBe("slice");
    expect(shortcut("/")).toBe("focus-prompt");
    expect(shortcut("[")).toBe("previous-version");
    expect(shortcut("]")).toBe("next-version");
  });

  it("maps command and view actions", () => {
    expect(shortcut("d", { commandKey: true })).toBe("duplicate");
    expect(shortcut("c", { commandKey: true, shiftKey: true })).toBe("copy-original");
    expect(shortcut("z", { commandKey: true })).toBe("undo");
    expect(shortcut("z", { commandKey: true, shiftKey: true })).toBe("redo");
    expect(shortcut("/", { commandKey: true })).toBe("show-shortcuts");
    expect(shortcut("1", { shiftKey: true })).toBe("fit-canvas");
    expect(shortcut("2", { shiftKey: true })).toBe("fit-selection");
    expect(shortcut("?", { shiftKey: true })).toBe("show-shortcuts");
  });

  it("does not claim unrelated or modified single-letter shortcuts", () => {
    expect(shortcut("c")).toBeNull();
    expect(shortcut("g")).toBeNull();
    expect(shortcut("e", { shiftKey: true })).toBeNull();
    expect(shortcut("r", { altKey: true })).toBeNull();
  });
});
