import { gzipSync } from "node:zlib";

type ViteChunkMetadata = {
  importedCss?: ReadonlySet<string>;
};

export type BundleChunk = {
  type: "chunk";
  fileName: string;
  name: string;
  code: string;
  imports: string[];
  facadeModuleId: string | null;
  viteMetadata?: ViteChunkMetadata;
};

export type BundleAsset = {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
};

export type BundleOutput = Record<string, BundleAsset | BundleChunk>;

export type BundleBudgetMeasurement = {
  files: string[];
  gzipBytes: number;
  rawBytes: number;
};

export function bundleBudgetViolation(
  label: string,
  measurement: BundleBudgetMeasurement,
  maxGzipBytes: number
): string | null {
  if (measurement.gzipBytes <= maxGzipBytes) return null;
  return `${label} and its static dependencies are ${(measurement.gzipBytes / 1_000).toFixed(1)} kB gzip; ` +
    `the ${label} entry budget is ${maxGzipBytes / 1_000} kB gzip.`;
}

function artifactBytes(output: BundleAsset | BundleChunk): Buffer {
  if (output.type === "chunk") return Buffer.from(output.code);
  return typeof output.source === "string" ? Buffer.from(output.source) : Buffer.from(output.source);
}

export function measureStaticEntry(
  bundle: BundleOutput,
  isEntry: (chunk: BundleChunk) => boolean
): BundleBudgetMeasurement | null {
  const entry = Object.values(bundle).find(
    (output): output is BundleChunk => output.type === "chunk" && isEntry(output)
  );
  if (!entry) return null;

  const files = new Set<string>();
  const visit = (fileName: string): void => {
    if (files.has(fileName)) return;
    const output = bundle[fileName];
    if (!output || output.type !== "chunk") return;
    files.add(fileName);
    for (const importedFile of output.imports) visit(importedFile);
    for (const cssFile of output.viteMetadata?.importedCss ?? []) {
      if (bundle[cssFile]?.type === "asset") files.add(cssFile);
    }
  };
  visit(entry.fileName);

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const fileName of files) {
    const bytes = artifactBytes(bundle[fileName]);
    rawBytes += bytes.byteLength;
    gzipBytes += gzipSync(bytes).byteLength;
  }

  return { files: [...files].sort(), gzipBytes, rawBytes };
}
