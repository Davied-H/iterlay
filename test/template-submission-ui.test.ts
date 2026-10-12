import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/workbench/SceneDetail.tsx", import.meta.url),
  "utf8"
);

describe("template submission review UI", () => {
  it("refreshes Manager status whenever the publish dialog opens", () => {
    expect(source).toContain("setSubmissionOpen(true);");
    expect(source).toContain("void refreshSubmission();");
    expect(source).toContain("await onGetSubmission(activeScene)");
  });

  it("shows Manager-owned review metadata and rejection reasons", () => {
    expect(source).toContain('label: "待审核"');
    expect(source).toContain('label: "被拒绝"');
    expect(source).toContain("submission.reviewNote");
    expect(source).toContain("submission.authorName");
    expect(source).toContain("submission.reviewedAt");
    expect(source).toContain("拒绝原因");
  });
});
