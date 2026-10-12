import { describe, expect, it } from "vitest";
import { partitionTemplateImportFiles } from "@/components/workbench/template-import";

describe("partitionTemplateImportFiles", () => {
  it("accepts .itt files case-insensitively", () => {
    const files = [{ name: "portrait.itt" }, { name: "CAMPAIGN.ITT" }];

    expect(partitionTemplateImportFiles(files)).toEqual({ accepted: files, rejected: [] });
  });

  it("rejects non-itt files and double extensions", () => {
    const accepted = { name: "template.itt" };
    const rejected = [{ name: "template.itb" }, { name: "template.itt.zip" }, { name: "notes.txt" }];

    expect(partitionTemplateImportFiles([accepted, ...rejected])).toEqual({
      accepted: [accepted],
      rejected
    });
  });
});
