import { describe, expect, it } from "vitest";
import {
  canExtractImageTemplate,
  shouldShowImageToolbar
} from "@/components/canvas/image-toolbar-visibility";

const hiddenState = {
  hasMultipleSelection: false,
  selected: false,
  hoverEnabled: false,
  hovered: false,
  menuOpen: false,
  noticeOpen: false
};

describe("image toolbar visibility", () => {
  it("shows node actions for a selected node or an enabled hover", () => {
    expect(shouldShowImageToolbar({ ...hiddenState, selected: true })).toBe(true);
    expect(shouldShowImageToolbar({ ...hiddenState, hoverEnabled: true, hovered: true })).toBe(true);
  });

  it("keeps an open node menu or notice visible outside multi-selection", () => {
    expect(shouldShowImageToolbar({ ...hiddenState, menuOpen: true })).toBe(true);
    expect(shouldShowImageToolbar({ ...hiddenState, noticeOpen: true })).toBe(true);
  });

  it("gives multi-selection exclusive ownership of the toolbar area", () => {
    expect(shouldShowImageToolbar({
      ...hiddenState,
      hasMultipleSelection: true,
      selected: true,
      hoverEnabled: true,
      hovered: true,
      menuOpen: true,
      noticeOpen: true
    })).toBe(false);
  });
});

describe("canvas image template extraction", () => {
  it.each(["generated", "upload", "slice"] as const)("allows completed %s images", (source) => {
    expect(canExtractImageTemplate({
      path: `/tmp/${source}.png`,
      dataUrl: "",
      source
    })).toBe(true);
  });

  it("allows an in-memory image when persistence failed", () => {
    expect(canExtractImageTemplate({ path: "", dataUrl: "data:image/png;base64,AAAA" })).toBe(true);
  });

  it("rejects pending and unreadable images", () => {
    expect(canExtractImageTemplate({ path: "/tmp/pending.png", dataUrl: "", pending: true })).toBe(false);
    expect(canExtractImageTemplate({ path: "", dataUrl: "" })).toBe(false);
  });
});
