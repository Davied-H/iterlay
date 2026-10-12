import { describe, expect, it } from "vitest";
import tailwindConfig from "../tailwind.config";
import {
  bundleBudgetViolation,
  measureStaticEntry,
  type BundleAsset,
  type BundleChunk,
  type BundleOutput
} from "../scripts/bundle-budget";

function chunk(
  fileName: string,
  code: string,
  imports: string[] = [],
  importedCss: string[] = []
): BundleChunk & { dynamicImports: string[] } {
  return {
    type: "chunk",
    fileName,
    name: fileName.replace(/\.js$/, ""),
    code,
    imports,
    dynamicImports: [],
    facadeModuleId: null,
    viteMetadata: { importedCss: new Set(importedCss) }
  };
}

function asset(fileName: string, source: string): BundleAsset {
  return {
    type: "asset",
    fileName,
    source
  };
}

describe("bundle budget", () => {
  it("measures each static JavaScript and CSS dependency once", () => {
    const bundle: BundleOutput = {
      "canvas.js": chunk("canvas.js", "canvas", ["shared.js", "vendor.js"], ["canvas.css"]),
      "shared.js": chunk("shared.js", "shared", ["vendor.js"]),
      "vendor.js": chunk("vendor.js", "vendor"),
      "canvas.css": asset("canvas.css", ".canvas{display:block}")
    };

    const result = measureStaticEntry(bundle, (output) => output.fileName === "canvas.js");

    expect(result?.files).toEqual(["canvas.css", "canvas.js", "shared.js", "vendor.js"]);
    expect(result?.rawBytes).toBe(
      Buffer.byteLength("canvas") + Buffer.byteLength("shared") + Buffer.byteLength("vendor") +
      Buffer.byteLength(".canvas{display:block}")
    );
    expect(result?.gzipBytes).toBeGreaterThan(0);
  });

  it("ignores dynamic imports and reports a missing entry", () => {
    const entry = chunk("canvas.js", "canvas");
    entry.dynamicImports = ["editor.js"];
    const bundle: BundleOutput = {
      "canvas.js": entry,
      "editor.js": chunk("editor.js", "large editor")
    };

    expect(measureStaticEntry(bundle, (output) => output.fileName === "canvas.js")?.files)
      .toEqual(["canvas.js"]);
    expect(measureStaticEntry(bundle, () => false)).toBeNull();
  });

  it("reports aggregate gzip regressions above the configured boundary", () => {
    const measurement = { files: ["canvas.js"], rawBytes: 2_000, gzipBytes: 1_001 };

    expect(bundleBudgetViolation("CanvasBoard", measurement, 1_000)).toContain("1.0 kB gzip");
    expect(bundleBudgetViolation("CanvasBoard", measurement, 1_001)).toBeNull();
  });

  it("excludes development preview entries from Tailwind's production scan", () => {
    expect(tailwindConfig.content).toContain("!./src/dev-*.{ts,tsx}");
    expect(tailwindConfig.content).toContain("./src/**/*.{ts,tsx}");
  });
});
