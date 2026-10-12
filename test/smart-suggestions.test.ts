import { describe, expect, it } from "vitest";
import { resolveEditSmartSuggestionsEnabled } from "@/lib/smart-suggestions";

describe("resolveEditSmartSuggestionsEnabled", () => {
  it("requires a ready text provider", () => {
    expect(resolveEditSmartSuggestionsEnabled(undefined, false)).toBe(false);
    expect(resolveEditSmartSuggestionsEnabled(true, false)).toBe(false);
  });

  it("follows the preference when the text provider is ready", () => {
    expect(resolveEditSmartSuggestionsEnabled(undefined, true)).toBe(false);
    expect(resolveEditSmartSuggestionsEnabled(true, true)).toBe(true);
    expect(resolveEditSmartSuggestionsEnabled(false, true)).toBe(false);
  });
});
