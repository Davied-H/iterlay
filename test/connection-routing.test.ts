import { describe, expect, it } from "vitest";
import {
  resolveConnectionPreviewTargetSide,
  snapConnectionEndpointCoordinate
} from "@/components/canvas/connection-routing";

describe("connection endpoint routing", () => {
  it("snaps an endpoint to the opposite coordinate inside the threshold", () => {
    expect(snapConnectionEndpointCoordinate(197, 200, 8)).toBe(200);
    expect(snapConnectionEndpointCoordinate(208, 200, 8)).toBe(200);
  });

  it("keeps the dragged coordinate outside the threshold", () => {
    expect(snapConnectionEndpointCoordinate(191, 200, 8)).toBe(191);
    expect(snapConnectionEndpointCoordinate(209, 200, 8)).toBe(209);
  });
});

describe("free connection preview routing", () => {
  it("enters a snapped target from its own side", () => {
    expect(resolveConnectionPreviewTargetSide("right", "left")).toBe("left");
    expect(resolveConnectionPreviewTargetSide("bottom", "top")).toBe("top");
  });

  it("faces an unsnapped endpoint back toward the source", () => {
    expect(resolveConnectionPreviewTargetSide("right")).toBe("left");
    expect(resolveConnectionPreviewTargetSide("left")).toBe("right");
    expect(resolveConnectionPreviewTargetSide("top")).toBe("bottom");
    expect(resolveConnectionPreviewTargetSide("bottom")).toBe("top");
  });
});
