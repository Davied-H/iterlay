import { describe, expect, it } from "vitest";
import { isShortcutHelpCommand, resolveBoardShortcutIndex } from "../src/lib/board-shortcuts";

function shortcut(
  key: string,
  overrides: Partial<Parameters<typeof resolveBoardShortcutIndex>[0]> = {}
): number | null {
  return resolveBoardShortcutIndex({
    key,
    code: `Digit${key}`,
    commandKey: true,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides
  });
}

describe("board shortcuts", () => {
  it("maps Command/Ctrl + 1-9 to zero-based board slots", () => {
    expect(shortcut("1")).toBe(0);
    expect(shortcut("9")).toBe(8);
    expect(shortcut("3", { code: "Numpad3" })).toBe(2);
  });

  it("ignores missing modifiers, shifted digits, zero and key repeats", () => {
    expect(shortcut("1", { commandKey: false })).toBeNull();
    expect(shortcut("1", { shiftKey: true })).toBeNull();
    expect(shortcut("0")).toBeNull();
    expect(shortcut("2", { repeat: true })).toBeNull();
  });

  it("recognizes the shortcut help command", () => {
    expect(isShortcutHelpCommand({
      key: "/",
      code: "Slash",
      commandKey: true,
      altKey: false,
      shiftKey: false,
      repeat: false
    })).toBe(true);
    expect(isShortcutHelpCommand({
      key: "/",
      code: "Slash",
      commandKey: true,
      altKey: false,
      shiftKey: true,
      repeat: false
    })).toBe(false);
  });
});
