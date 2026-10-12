import { describe, expect, it } from "vitest";
import {
  IMAGE_TOOLBAR_TOP_CLEARANCE,
  resolveImageToolbarSide
} from "@/components/canvas/image-toolbar-position";

describe("image toolbar positioning", () => {
  it("uses the node bottom only when the pane has no room above the toolbar", () => {
    expect(resolveImageToolbarSide(IMAGE_TOOLBAR_TOP_CLEARANCE - 1)).toBe("bottom");
    expect(resolveImageToolbarSide(IMAGE_TOOLBAR_TOP_CLEARANCE)).toBe("top");
  });

  it("keeps nodes below the pane header on top, clear of the prompt dock", () => {
    expect(resolveImageToolbarSide(73)).toBe("top");
  });
});
