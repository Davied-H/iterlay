import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardDetail } from "../shared/types";
import { collectBoardImageUrls, preloadBoardImages } from "../src/lib/board-preload";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("board image preload selection", () => {
  it("collects current and version images once in board order", () => {
    const detail: Pick<BoardDetail, "nodes" | "images"> = {
      nodes: [
        { id: "text", type: "text", text: "不应进入图片解码", x: -100, y: 0 },
        {
          id: "node-a",
          imagePath: "a-current",
          jobId: "job-a",
          source: "generated",
          x: 0,
          y: 0,
          versions: [
            { imagePath: "a-old", jobId: "job-a-old" },
            { imagePath: "a-current", jobId: "job-a" }
          ]
        },
        {
          id: "node-b",
          imagePath: "b-current",
          jobId: "job-b",
          source: "upload",
          x: 100,
          y: 100
        }
      ],
      images: {
        "a-current": "asset://a-current",
        "a-old": "asset://a-old",
        "b-current": "asset://b-current"
      }
    };

    expect(collectBoardImageUrls(detail)).toEqual([
      "asset://a-current",
      "asset://a-old",
      "asset://b-current"
    ]);
  });

  it("skips missing resources instead of blocking board entry", () => {
    const detail: Pick<BoardDetail, "nodes" | "images"> = {
      nodes: [{
        id: "node-a",
        imagePath: "missing",
        jobId: "job-a",
        source: "generated",
        x: 0,
        y: 0
      }],
      images: {}
    };

    expect(collectBoardImageUrls(detail)).toEqual([]);
  });

  it("stops workers from claiming more images after the request is superseded", async () => {
    const startedUrls: string[] = [];
    let shouldContinue = true;

    class FakeImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        startedUrls.push(url);
        shouldContinue = false;
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", FakeImage);
    const detail: Pick<BoardDetail, "nodes" | "images"> = {
      nodes: Array.from({ length: 8 }, (_, index) => ({
        id: `node-${index}`,
        imagePath: `image-${index}`,
        jobId: `job-${index}`,
        source: "generated" as const,
        x: index * 100,
        y: 0
      })),
      images: Object.fromEntries(
        Array.from({ length: 8 }, (_, index) => [`image-${index}`, `asset://cancel-${index}`])
      )
    };

    await preloadBoardImages(detail, { shouldContinue: () => shouldContinue });

    expect(startedUrls).toEqual(["asset://cancel-0"]);
  });

  it("caps an idle preload batch to avoid decoding the entire board at once", async () => {
    const startedUrls: string[] = [];
    class FakeImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        startedUrls.push(url);
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const detail: Pick<BoardDetail, "nodes" | "images"> = {
      nodes: Array.from({ length: 20 }, (_, index) => ({
        id: `limited-${index}`,
        imagePath: `limited-path-${index}`,
        jobId: `limited-job-${index}`,
        source: "generated" as const,
        x: index * 100,
        y: 0
      })),
      images: Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [`limited-path-${index}`, `asset://limited-${index}`])
      )
    };

    await preloadBoardImages(detail, { maxImages: 5 });

    expect(startedUrls).toHaveLength(5);
  });

  it("evicts old decodes when their estimated memory exceeds the byte budget", async () => {
    const startedUrls: string[] = [];
    class FakeImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        startedUrls.push(url);
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const images = Object.fromEntries(
      Array.from({ length: 17 }, (_, index) => [`budget-path-${index}`, `asset://budget-${index}`])
    );
    const nodes = Array.from({ length: 17 }, (_, index) => ({
      id: `budget-${index}`,
      imagePath: `budget-path-${index}`,
      jobId: `budget-job-${index}`,
      source: "generated" as const,
      x: index * 100,
      y: 0
    }));

    await preloadBoardImages({ nodes, images });
    await preloadBoardImages({ nodes: [nodes[0]], images });

    expect(startedUrls.filter((url) => url === "asset://budget-0")).toHaveLength(2);
  });
});
