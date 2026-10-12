import { describe, expect, it } from "vitest";
import { isSendEnter } from "../src/lib/send-on-enter";

describe("send on enter", () => {
  it("treats Enter as send while preserving Shift+Enter for a newline", () => {
    expect(isSendEnter({ key: "Enter" })).toBe(true);
    expect(isSendEnter({ key: "Enter", shiftKey: true })).toBe(false);
    expect(isSendEnter({ key: "Enter", metaKey: true } as Parameters<typeof isSendEnter>[0])).toBe(true);
  });

  it("ignores non-Enter keys and IME composition confirmation", () => {
    expect(isSendEnter({ key: "a" })).toBe(false);
    expect(isSendEnter({ key: "Enter", isComposing: true })).toBe(false);
    expect(isSendEnter({ key: "Enter", nativeEvent: { isComposing: true } })).toBe(false);
  });
});
