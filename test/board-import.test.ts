import { describe, expect, it } from "vitest";
import { partitionBoardImportFiles } from "@/components/workbench/board-import";

describe("partitionBoardImportFiles", () => {
  it("accepts .itb files case-insensitively", () => {
    const files = [{ name: "campaign.itb" }, { name: "ARCHIVE.ITB" }];

    expect(partitionBoardImportFiles(files)).toEqual({ accepted: files, rejected: [] });
  });

  it("rejects non-itb files and double extensions", () => {
    const accepted = { name: "board.itb" };
    const rejected = [{ name: "board.irb" }, { name: "board.itb.zip" }, { name: "notes.txt" }];

    expect(partitionBoardImportFiles([accepted, ...rejected])).toEqual({
      accepted: [accepted],
      rejected
    });
  });
});
