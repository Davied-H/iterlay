import { describe, expect, it } from "vitest";
import {
  clientToFlow,
  screenPxToFlow
} from "@/components/canvas/canvas-coordinates";

describe("canvas coordinates", () => {
  it("keeps screen-space hit targets stable at any zoom", () => {
    expect(screenPxToFlow(24, 2)).toBe(12);
    expect(screenPxToFlow(24, 0.5)).toBe(48);
    expect(screenPxToFlow(24, 0)).toBe(24);
  });

  it("converts client coordinates using container offset and viewport transform", () => {
    expect(clientToFlow(
      { x: 310, y: 190 },
      { left: 10, top: 20 },
      { x: 100, y: 50, zoom: 2 }
    )).toEqual({ x: 100, y: 60 });
  });
});
