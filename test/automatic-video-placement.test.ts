import { describe, expect, it } from "vitest";
import { automaticVideoPlacement } from "../src/lib/automatic-video-placement";

describe("automaticVideoPlacement", () => {
  it("keeps the initial position on an empty board", () => {
    expect(automaticVideoPlacement([])).toEqual({ x: 80, y: 80 });
  });
  it("clears every card including wide and negatively positioned cards", () => {
    const cards = [{ x: -400, y: -200, width: 1600 }, { x: 900, y: 100, width: 680 }];
    const position = automaticVideoPlacement(cards);
    expect(position).toEqual({ x: 1676, y: -200 });
    for (const card of cards) expect(position.x).toBeGreaterThan(card.x + card.width);
    expect(automaticVideoPlacement([...cards, { ...position, width: 340 }]).x).toBe(2112);
  });
});
