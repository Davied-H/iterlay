import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd();
const compiled = path.resolve(process.env.ITERLAY_BENCHMARK_BUILD_DIR || "dist-electron");
const temporary = await mkdtemp(path.join(os.tmpdir(), "iterlay-storage-benchmark-"));
const require = createRequire(path.join(root, "package.json"));
const samples = 20;
const { BoardStore } = await import(pathToFileURL(path.join(compiled, "electron/storage/board-store.js")).href);
const { readImageDimensions, imageDimensionsFromHeader } = await import(pathToFileURL(path.join(compiled, "electron/media/image-metadata.js")).href);
const fixturePath = path.join(root, "demo-assets/lamp-studio.jpg");
const dimensions = imageDimensionsFromHeader(await readFile(fixturePath));
if (!dimensions) throw new Error("Fixture metadata could not be read");
const implementations = [{ name: "current", Store: BoardStore }];
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const summary = (values) => ({ samples: values.length, medianMs: Number(percentile(values, 0.5).toFixed(2)), p95Ms: Number(percentile(values, 0.95).toFixed(2)) });
const metadata = (file) => readImageDimensions(file, async () => null);
const board = (id, count) => ({
  schemaVersion: 3, revision: 1, id, name: id, createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z",
  nodes: Array.from({ length: count }, (_, index) => ({
    id: "image-" + index, type: "image", imagePath: fixturePath, jobId: "fixture", source: "generated",
    width: dimensions.width, height: dimensions.height, x: index % 10 * 300, y: Math.floor(index / 10) * 300
  }))
});
async function pool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(16, items.length) }, async () => {
    while (next < items.length) { const index = next++; await fn(items[index]); }
  }));
}
try {
  const baseline = process.env.ITERLAY_BENCHMARK_BASE_REF;
  if (baseline) {
    const dir = path.join(temporary, "baseline");
    await mkdir(path.join(dir, "electron/storage"), { recursive: true });
    await writeFile(path.join(dir, "package.json"), '{"type":"module"}');
    await symlink(path.join(compiled, "shared"), path.join(dir, "shared"), "dir");
    await symlink(path.join(compiled, "electron/storage/atomic-json.js"), path.join(dir, "electron/storage/atomic-json.js"));
    const source = execFileSync("git", ["show", baseline + ":electron/storage/board-store.ts"], { encoding: "utf8" });
    const ts = require("typescript");
    await writeFile(path.join(dir, "electron/storage/board-store.js"), ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText);
    const imported = await import(pathToFileURL(path.join(dir, "electron/storage/board-store.js")).href);
    implementations.unshift({ name: "baseline:" + baseline, Store: imported.BoardStore });
  }
  const results = [];
  for (const count of [100, 1000, 5000]) {
    const directory = path.join(temporary, "nodes-" + count);
    await mkdir(path.join(directory, "boards"), { recursive: true });
    await writeFile(path.join(directory, "boards/benchmark.json"), JSON.stringify(board("benchmark", count)));
    for (const { name, Store } of implementations) {
      globalThis.gc?.();
      const firstReads = [];
      for (let index = 0; index < samples; index++) {
        const store = new Store(directory, metadata);
        const start = performance.now();
        const result = await store.getBoardWithVerifiedImageDimensions("benchmark");
        firstReads.push(performance.now() - start);
        if (result.nodes.length !== count) throw new Error("Benchmark lost board nodes");
      }
      results.push({ case: "first-read-of-new-store", implementation: name, boards: 1, nodesPerBoard: count, ...summary(firstReads) });
    }
  }
  for (const count of [100, 1000]) {
    const directory = path.join(temporary, "library-" + count);
    await mkdir(path.join(directory, "boards"), { recursive: true });
    await pool(Array.from({ length: count }, (_, index) => index), (index) => writeFile(path.join(directory, "boards/board-" + index + ".json"), JSON.stringify(board("board-" + index, 10))));
    for (const { name, Store } of implementations) {
      globalThis.gc?.();
      const store = new Store(directory, metadata);
      const first = performance.now();
      const records = await store.listSummaries();
      const firstMs = performance.now() - first;
      if (records.length !== count) throw new Error("Benchmark lost board summaries");
      const repeated = [];
      for (let index = 0; index < samples; index++) {
        const start = performance.now();
        await store.listSummaries();
        repeated.push(performance.now() - start);
      }
      results.push({ case: "repeated-library-summary", implementation: name, boards: count, nodesPerBoard: 10, initialMs: Number(firstMs.toFixed(2)), ...summary(repeated) });
    }
  }
  const output = { measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
    method: "20 samples, nearest-rank median and p95; fresh Store objects, OS filesystem cache is not cleared. All nodes share one JPEG; excludes renderer, bitmap decode, and provider latency. Baseline replaces BoardStore only, using identical runtime and metadata reader.",
    results };
  await mkdir("output/engineering", { recursive: true });
  await writeFile("output/engineering/storage-benchmark.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
