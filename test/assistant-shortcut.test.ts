import { describe, expect, it } from "vitest";
import {
  getAssistantShortcutDescriptor,
  matchesAssistantShortcut
} from "../src/lib/assistant-shortcut";

function shortcut(overrides: Partial<Parameters<typeof matchesAssistantShortcut>[0]> = {}) {
  return {
    key: "j",
    code: "KeyJ",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides
  };
}

describe("assistant shortcut", () => {
  it("uses the platform command modifier and exposes accessible labels", () => {
    expect(getAssistantShortcutDescriptor("MacIntel")).toEqual({
      label: "⌘ J",
      ariaKeyShortcuts: "Meta+J"
    });
    expect(getAssistantShortcutDescriptor("Win32")).toEqual({
      label: "Ctrl J",
      ariaKeyShortcuts: "Control+J"
    });
  });

  it("matches Command J on Apple platforms and Ctrl J elsewhere", () => {
    expect(matchesAssistantShortcut(shortcut({ metaKey: true }), "MacIntel")).toBe(true);
    expect(matchesAssistantShortcut(shortcut({ ctrlKey: true }), "MacIntel")).toBe(false);
    expect(matchesAssistantShortcut(shortcut({ ctrlKey: true }), "Win32")).toBe(true);
    expect(matchesAssistantShortcut(shortcut({ metaKey: true }), "Win32")).toBe(false);
  });

  it("ignores shifted, alternate, repeated, and unrelated shortcuts", () => {
    expect(matchesAssistantShortcut(shortcut({ metaKey: true, shiftKey: true }), "MacIntel")).toBe(false);
    expect(matchesAssistantShortcut(shortcut({ ctrlKey: true, altKey: true }), "Win32")).toBe(false);
    expect(matchesAssistantShortcut(shortcut({ ctrlKey: true, repeat: true }), "Win32")).toBe(false);
    expect(matchesAssistantShortcut(shortcut({ key: "k", code: "KeyK", ctrlKey: true }), "Win32")).toBe(false);
  });
});
