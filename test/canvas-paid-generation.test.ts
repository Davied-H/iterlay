import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("canvas paid generation", () => {
  it("binds the quote and submission to the same active board", () => {
    const generateStart = app.indexOf("async function generate(");
    const generateEnd = app.indexOf("\n  function ", generateStart);
    const source = app.slice(generateStart, generateEnd);

    const originBoardIndex = source.indexOf("const originBoard = activeBoardRef.current;");
    const quoteIndex = source.indexOf("await paidGenerationMetadata");
    expect(originBoardIndex).toBeGreaterThanOrEqual(0);
    expect(originBoardIndex).toBeLessThan(quoteIndex);
    expect(source).toContain("boardId: originBoard.id,");
    expect(source).not.toContain('boardId: generationInput.boardId ?? "global"');

    const payloadStart = source.indexOf("const payload: GenerateImageInput");
    const payloadEnd = source.indexOf("const result: GenerateResponse", payloadStart);
    expect(source.slice(payloadStart, payloadEnd)).toContain("boardId: originBoard.id,");
  });
});
