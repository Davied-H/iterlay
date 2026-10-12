import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/workbench/asset/ImageZoomLightbox.tsx", import.meta.url),
  "utf8"
);

describe("ImageZoomLightbox", () => {
  it("lets the scaled image grow beyond its fitted frame", () => {
    expect(source).not.toContain('className="absolute overflow-hidden bg-card shadow-2xl"');
    expect(source).toContain(
      'className="h-full w-full select-none rounded-lg bg-card object-contain shadow-2xl"'
    );
  });

  it("supports placing the close action on the image when the preview needs a local affordance", () => {
    expect(source).toContain('closeButtonPlacement?: "viewport" | "image"');
    expect(source).toContain('closeButtonPlacement === "image"');
  });

  it("supports a dimmed backdrop for context image previews", () => {
    expect(source).toContain('backdrop?: "solid" | "dim"');
    expect(source).toContain('backdrop === "dim"');
    expect(source).toContain("bg-black/55");
  });

  it("allows callers to hide the metadata details panel", () => {
    expect(source).toContain("showDetailsPanel?: boolean");
    expect(source).toContain("showDetailsPanel = true");
    expect(source).toContain("showDetailsPanel ? <PreviewInspector");
  });

  it("uses a gray mask instead of an opaque white backdrop for the default preview", () => {
    expect(source).toContain("bg-black/70 dark:bg-black/80");
    expect(source).not.toContain("bg-background/98");
  });
});
