import { describe, expect, it } from "vitest";
import {
  ASSISTANT_DOCK_LAYOUT_STORAGE_KEY,
  ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH,
  readAssistantDockLayout,
  resolveAssistantDockMagnet,
  resolveAssistantDockWidth,
  writeAssistantDockLayout
} from "../src/lib/assistant-panel-docking";

describe("assistant panel edge docking", () => {
  it("starts a progressive left-edge magnet inside the hot zone", () => {
    const result = resolveAssistantDockMagnet({
      panelLeft: 36,
      panelWidth: 360,
      viewportWidth: 1440
    });

    expect(result?.side).toBe("left");
    expect(result?.strength).toBeCloseTo(0.25);
    expect(result?.left).toBeGreaterThan(0);
    expect(result?.left).toBeLessThan(36);
  });

  it("aligns decisively when the panel reaches an edge", () => {
    expect(resolveAssistantDockMagnet({
      panelLeft: 0,
      panelWidth: 360,
      viewportWidth: 1440
    })).toEqual({ side: "left", left: 0, strength: 1 });

    expect(resolveAssistantDockMagnet({
      panelLeft: 1080,
      panelWidth: 360,
      viewportWidth: 1440
    })).toEqual({ side: "right", left: 1080, strength: 1 });
  });

  it("does not offer a blocked right edge", () => {
    expect(resolveAssistantDockMagnet({
      panelLeft: 1060,
      panelWidth: 360,
      viewportWidth: 1440,
      rightAvailable: false
    })).toBeNull();
  });

  it("keeps docking disabled when a sidebar would consume a narrow window", () => {
    expect(resolveAssistantDockMagnet({
      panelLeft: 0,
      panelWidth: 360,
      viewportWidth: ASSISTANT_DOCK_MIN_VIEWPORT_WIDTH - 1
    })).toBeNull();
  });

  it("keeps the docked sidebar within its supported width range", () => {
    expect(resolveAssistantDockWidth(260, 1440)).toBe(320);
    expect(resolveAssistantDockWidth(540, 1440)).toBe(480);
    expect(resolveAssistantDockWidth(420, 760)).toBe(420);
  });

  it("persists and restores the selected sidebar layout", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };

    writeAssistantDockLayout({ side: "left", width: 420 }, storage);

    expect(values.get(ASSISTANT_DOCK_LAYOUT_STORAGE_KEY))
      .toBe('{"side":"left","width":420}');
    expect(readAssistantDockLayout(storage)).toEqual({ side: "left", width: 420 });

    writeAssistantDockLayout(null, storage);
    expect(readAssistantDockLayout(storage)).toBeNull();
  });

  it.each([
    null,
    "not-json",
    "{}",
    '{"side":"top","width":360}',
    '{"side":"right","width":0}',
    '{"side":"left","width":"420"}'
  ])("ignores missing or malformed stored dock layouts: %s", (stored) => {
    expect(readAssistantDockLayout({ getItem: () => stored })).toBeNull();
  });

  it("ignores storage access failures", () => {
    expect(readAssistantDockLayout({
      getItem: () => { throw new Error("denied"); }
    })).toBeNull();
    expect(() => writeAssistantDockLayout(
      { side: "right", width: 360 },
      {
        setItem: () => { throw new Error("denied"); },
        removeItem: () => { throw new Error("denied"); }
      }
    )).not.toThrow();
  });
});
