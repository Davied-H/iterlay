import { describe, expect, it } from "vitest";
import type { GenerationJob } from "../shared/types";
import { hasGalleryTourContent } from "../src/lib/gallery-onboarding";

function job(id: string, boardId: string, createdAt: string, paths: string[]): GenerationJob {
  return {
    id,
    boardId,
    status: "succeeded",
    createdAt,
    prompt: id,
    input: {
      workflowMode: "generate",
      prompt: id,
      model: "test",
      size: "auto",
      n: paths.length,
      quality: "high",
      style: "natural"
    },
    referenceImagePaths: [],
    outputImagePaths: paths
  };
}

describe("gallery onboarding eligibility", () => {
  it("requires at least six unique images across two local days", () => {
    const history = [
      job("one", "board-a", "2026-07-18T10:00:00+08:00", ["1", "2", "3"]),
      job("two", "board-a", "2026-07-19T10:00:00+08:00", ["4", "5", "6"])
    ];

    const images = history.flatMap((item) => item.outputImagePaths.map((path) => ({ path, jobId: item.id })));
    expect(hasGalleryTourContent(history, "board-a", images)).toBe(true);
  });

  it("does not count duplicate paths, other boards, or failed jobs", () => {
    const failed = { ...job("failed", "board-a", "2026-07-19T10:00:00+08:00", ["6", "7"]), status: "failed" as const };
    const history = [
      job("one", "board-a", "2026-07-18T10:00:00+08:00", ["1", "2", "3", "4", "5"]),
      job("two", "board-a", "2026-07-19T10:00:00+08:00", ["5"]),
      job("other", "board-b", "2026-07-19T10:00:00+08:00", ["6", "7", "8"]),
      failed
    ];

    const images = history.flatMap((item) => item.outputImagePaths.map((path) => ({ path, jobId: item.id })));
    expect(hasGalleryTourContent(history, "board-a", images)).toBe(false);
  });

  it("ignores generated images that are no longer on the board", () => {
    const history = [
      job("one", "board-a", "2026-07-18T10:00:00+08:00", ["1", "2", "3"]),
      job("two", "board-a", "2026-07-19T10:00:00+08:00", ["4", "5", "6"])
    ];
    const images = [
      { path: "1", jobId: "one" },
      { path: "4", jobId: "two" }
    ];

    expect(hasGalleryTourContent(history, "board-a", images)).toBe(false);
  });
});
