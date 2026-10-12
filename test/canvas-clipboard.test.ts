import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../src/components/canvas/ImageNode";
import {
  CANVAS_CLIPBOARD_TYPE,
  duplicateClipboardImages,
  extractClipboardImageFiles,
  extractCanvasClipboardItems,
  parseCanvasClipboardItems,
  placeClipboardItemsAtPoint,
  serializeCanvasClipboardItems,
  type CanvasClipboardItem
} from "../src/components/canvas/canvas-clipboard";

function image(id: string, width = 100, height = 100): GeneratedImage {
  return {
    id,
    path: `/images/${id}.png`,
    dataUrl: `iterlay-asset://local/${id}`,
    jobId: `job-${id}`,
    width,
    height
  };
}

describe("canvas clipboard", () => {
  it("extracts image files from clipboard items and ignores non-images", () => {
    const imageFile = new File(["image"], "reference.png", { type: "image/png" });
    const textFile = new File(["text"], "notes.txt", { type: "text/plain" });
    const files = extractClipboardImageFiles({
      items: [
        { kind: "file", type: imageFile.type, getAsFile: () => imageFile },
        { kind: "file", type: textFile.type, getAsFile: () => textFile }
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList
    });

    expect(files).toEqual([imageFile]);
  });

  it("round-trips copied nodes through a cross-board clipboard payload", () => {
    const items: CanvasClipboardItem[] = [
      { image: image("cross-board"), position: { x: 120, y: 240 } }
    ];

    expect(parseCanvasClipboardItems(serializeCanvasClipboardItems(items))).toEqual(items);
    expect(extractCanvasClipboardItems({
      getData: (type) => type === CANVAS_CLIPBOARD_TYPE ? serializeCanvasClipboardItems(items) : ""
    })).toEqual(items);
  });

  it("ignores unrelated or malformed clipboard payloads", () => {
    expect(parseCanvasClipboardItems("plain text")).toBeNull();
    expect(parseCanvasClipboardItems(JSON.stringify({ version: 2, items: [] }))).toBeNull();
    expect(parseCanvasClipboardItems(JSON.stringify({
      version: 1,
      items: [{ image: { id: "incomplete" }, position: { x: 0, y: 0 } }]
    }))).toBeNull();
  });

  it("centers a single copied image beneath the pointer", () => {
    const [placed] = placeClipboardItemsAtPoint(
      [{ image: image("square"), position: { x: 20, y: 40 } }],
      { x: 500, y: 300 }
    );

    expect(placed.position).toEqual({ x: 368, y: 168 });
  });

  it("centers and preserves a resized image using its display width", () => {
    const [placed] = placeClipboardItemsAtPoint(
      [{ image: image("wide", 200, 100), position: { x: 20, y: 40 }, width: 400 }],
      { x: 500, y: 300 }
    );

    expect(placed).toMatchObject({
      width: 400,
      position: { x: 300, y: 200 }
    });
  });

  it("keeps a multi-selection's relative layout and centers the group", () => {
    const items: CanvasClipboardItem[] = [
      { image: image("left"), position: { x: 100, y: 80 } },
      { image: image("right", 200, 100), position: { x: 420, y: 120 } }
    ];

    const placed = placeClipboardItemsAtPoint(items, { x: 1000, y: 600 });

    expect(placed[1].position.x - placed[0].position.x).toBe(320);
    expect(placed[1].position.y - placed[0].position.y).toBe(40);
    expect(placed).toEqual([
      { image: items[0].image, position: { x: 708, y: 468 } },
      { image: items[1].image, position: { x: 1028, y: 508 } }
    ]);
  });

  it("creates new selected nodes and remaps copied derivation links", () => {
    const source = image("source");
    const derived: GeneratedImage = {
      ...image("derived"),
      derivation: {
        sourceNodeId: source.id,
        sourceImagePath: source.path,
        crop: { x: 1, y: 2, width: 30, height: 40 }
      }
    };
    let id = 0;

    const copies = duplicateClipboardImages(
      [
        { image: source, position: { x: 10, y: 20 } },
        { image: derived, position: { x: 300, y: 20 } }
      ],
      () => `copy-${id += 1}`
    );

    expect(copies.map((copy) => copy.id)).toEqual(["copy-1", "copy-2"]);
    expect(copies[1].derivation?.sourceNodeId).toBe("copy-1");
    expect(copies[0]).toMatchObject({
      placementPosition: { x: 10, y: 20 },
      preserveViewportOnCreate: true,
      selectOnCreate: true
    });
  });

  it("carries a resized node width into its duplicate", () => {
    const [copy] = duplicateClipboardImages(
      [{ image: image("resized"), position: { x: 10, y: 20 }, width: 520 }],
      () => "copy-resized"
    );

    expect(copy.placementWidth).toBe(520);
  });

  it("preserves the active edit version chain without sharing its array", () => {
    const source: GeneratedImage = {
      ...image("edited"),
      activeVersion: 1,
      versions: [
        { path: "/images/original.png", dataUrl: "original", jobId: "job-original" },
        { path: "/images/edited.png", dataUrl: "edited", jobId: "job-edited" }
      ]
    };

    const [copy] = duplicateClipboardImages(
      [{ image: source, position: { x: 40, y: 80 } }],
      () => "copy-edited"
    );

    expect(copy).toMatchObject({
      id: "copy-edited",
      activeVersion: 1,
      path: source.path,
      placementPosition: { x: 40, y: 80 }
    });
    expect(copy.versions).toEqual(source.versions);
    expect(copy.versions).not.toBe(source.versions);
    expect(copy.versions?.[0]).not.toBe(source.versions?.[0]);
  });
});
