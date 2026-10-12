import { describe, expect, it } from "vitest";
import {
  ASSISTANT_PANEL_SIZE_STORAGE_KEY,
  readAssistantPanelSize,
  writeAssistantPanelSize
} from "../src/lib/assistant-panel-size";

describe("assistant panel size persistence", () => {
  it("round-trips a valid panel size", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    writeAssistantPanelSize({ width: 468, height: 672 }, storage);

    expect(values.get(ASSISTANT_PANEL_SIZE_STORAGE_KEY)).toBe('{"width":468,"height":672}');
    expect(readAssistantPanelSize(storage)).toEqual({ width: 468, height: 672 });
  });

  it.each([
    null,
    "not-json",
    "{}",
    '{"width":0,"height":500}',
    '{"width":420,"height":-1}',
    '{"width":"420","height":500}'
  ])("ignores missing or malformed stored size: %s", (stored) => {
    expect(readAssistantPanelSize({ getItem: () => stored })).toBeNull();
  });

  it("ignores storage access failures", () => {
    expect(readAssistantPanelSize({ getItem: () => { throw new Error("denied"); } })).toBeNull();
    expect(() => writeAssistantPanelSize(
      { width: 468, height: 672 },
      { setItem: () => { throw new Error("denied"); } }
    )).not.toThrow();
  });
});
