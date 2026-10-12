import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_SIDEBAR_SIZE,
  LIBRARY_SIDEBAR_MAX_WIDTH,
  LIBRARY_SIDEBAR_PRESETS,
  LIBRARY_SIDEBAR_SIZE_STORAGE_KEY,
  createLibrarySidebarPreference,
  getAdjacentLibrarySidebarPreset,
  getClosestLibrarySidebarPreset,
  readLibrarySidebarSize,
  resolveLibrarySidebarSnap,
  writeLibrarySidebarSize
} from "../src/lib/library-sidebar-size";

describe("library sidebar sizing", () => {
  it("keeps the existing 240px sidebar as the default preset", () => {
    expect(DEFAULT_LIBRARY_SIDEBAR_SIZE).toEqual({ width: 240, mode: "default" });
    expect(LIBRARY_SIDEBAR_PRESETS).toEqual({ small: 56, medium: 208, default: 240 });
  });

  it("clamps custom widths while preserving the three exact presets", () => {
    expect(createLibrarySidebarPreference(100)).toEqual({ width: 100, mode: "custom" });
    expect(createLibrarySidebarPreference(208)).toEqual({ width: 208, mode: "medium" });
    expect(createLibrarySidebarPreference(226)).toEqual({ width: 226, mode: "custom" });
    expect(createLibrarySidebarPreference(999)).toEqual({ width: LIBRARY_SIDEBAR_MAX_WIDTH, mode: "default" });
  });

  it("settles continuous drag widths onto one of the three modes", () => {
    expect(getClosestLibrarySidebarPreset(100)).toEqual({ width: 56, mode: "small" });
    expect(getClosestLibrarySidebarPreset(140)).toEqual({ width: 208, mode: "medium" });
    expect(getClosestLibrarySidebarPreset(224)).toEqual({ width: 240, mode: "default" });
  });

  it("enters and exits a preset with hysteresis", () => {
    expect(resolveLibrarySidebarSnap(198, null)).toEqual({
      width: 208,
      mode: "medium",
      lockedPreset: "medium"
    });
    expect(resolveLibrarySidebarSnap(225, "medium")).toEqual({
      width: 208,
      mode: "medium",
      lockedPreset: "medium"
    });
    expect(resolveLibrarySidebarSnap(227, "medium")).toEqual({
      width: 227,
      mode: "custom",
      lockedPreset: null
    });
  });

  it("jumps to the next preset in either direction", () => {
    expect(getAdjacentLibrarySidebarPreset(218, -1)).toEqual({ width: 208, mode: "medium" });
    expect(getAdjacentLibrarySidebarPreset(218, 1)).toEqual({ width: 240, mode: "default" });
    expect(getAdjacentLibrarySidebarPreset(56, -1)).toEqual({ width: 56, mode: "small" });
  });

  it("persists the closest stable mode", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    writeLibrarySidebarSize({ width: 208, mode: "medium" }, storage);
    expect(values.get(LIBRARY_SIDEBAR_SIZE_STORAGE_KEY)).toBe('{"width":208,"mode":"medium"}');
    expect(readLibrarySidebarSize(storage)).toEqual({ width: 208, mode: "medium" });

    writeLibrarySidebarSize({ width: 222, mode: "custom" }, storage);
    expect(readLibrarySidebarSize(storage)).toEqual({ width: 208, mode: "medium" });
  });

  it.each([null, "not-json", "{}", '{"width":"208","mode":"medium"}']) (
    "falls back when stored data is missing or malformed: %s",
    (stored) => {
      expect(readLibrarySidebarSize({ getItem: () => stored })).toEqual(DEFAULT_LIBRARY_SIDEBAR_SIZE);
    }
  );

  it("ignores storage access failures", () => {
    expect(readLibrarySidebarSize({ getItem: () => { throw new Error("denied"); } }))
      .toEqual(DEFAULT_LIBRARY_SIDEBAR_SIZE);
    expect(() => writeLibrarySidebarSize(
      { width: 208, mode: "medium" },
      { setItem: () => { throw new Error("denied"); } }
    )).not.toThrow();
  });
});
