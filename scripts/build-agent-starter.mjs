#!/usr/bin/env node
/**
 * Rebuild the public FIELD starter from its checked-in .itb source.
 * --from-dev refreshes that source from the single documented, isolated FIELD board.
 * Never reads the installed App's data, provider configuration or credentials.
 */
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "website/public/examples/field");
const sourceBoardId = "bb9c89f5-d280-4269-94c7-9fa64390afb4";
const archiveName = "field-starter.itb";
const archivePath = path.join(publicDir, archiveName);
await mkdir(path.join(root, "tmp"), { recursive: true });
const tempDir = await mkdtemp(path.join(root, "tmp/agent-starter-build-"));
const sourcePrompts = JSON.parse(await readFile(path.join(root, "docs/assets/readme/examples/prompts.json"), "utf8"));

try {
  await mkdir(publicDir, { recursive: true });
  await build({
    entryPoints: [path.join(root, "electron/board-archive.ts"), path.join(root, "electron/board-archive-worker.ts")],
    outdir: tempDir, bundle: true, packages: "external", platform: "node", format: "esm", target: "node22"
  });
  const { buildBoardArchive, parseBoardArchive } = await import(pathToFileURL(path.join(tempDir, "board-archive.js")).href);
  let board;
  let jobs;
  if (process.argv.includes("--from-dev")) {
    const workspace = path.join(root, "tmp/browser-dev/user-data/workspace");
    board = JSON.parse(await readFile(path.join(workspace, "boards", `${sourceBoardId}.json`), "utf8"));
    const history = JSON.parse(await readFile(path.join(workspace, "history.json"), "utf8"));
    const expectedIds = new Set(sourcePrompts.assets.map((asset) => asset.jobId));
    jobs = history.filter((job) => expectedIds.has(job.id));
    if (jobs.length !== 4 || jobs.some((job) => job.status !== "succeeded" || job.boardId !== sourceBoardId)) {
      throw new Error("The isolated FIELD board must contain all four documented successful generation jobs.");
    }
    // Restrict publication to the known FIELD outputs and their byte-identical references.
    const expectedFiles = new Set(jobs.flatMap((job) => job.outputImagePaths));
    const knownHashes = new Map();
    for (const file of expectedFiles) {
      const relative = path.relative(workspace, file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("FIELD media escaped the isolated workspace.");
      knownHashes.set(createHash("sha256").update(await readFile(file)).digest("hex"), file);
    }
    jobs = await Promise.all(jobs.map(async (job) => ({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      prompt: job.prompt,
      model: job.model,
      // Exact request inputs contain no provider endpoint, credential or account identity.
      input: {
        workflowMode: job.input.workflowMode,
        prompt: job.input.prompt,
        model: job.input.model,
        size: job.input.size,
        n: job.input.n,
        quality: job.input.quality,
        style: job.input.style,
        background: job.input.background,
        outputFormat: job.input.outputFormat
      },
      referenceImagePaths: await Promise.all(job.referenceImagePaths.map(async (file) => {
        const relative = path.relative(workspace, file);
        if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("FIELD reference escaped the isolated workspace.");
        const match = knownHashes.get(createHash("sha256").update(await readFile(file)).digest("hex"));
        if (!match) throw new Error("FIELD reference does not match a documented source image.");
        return match;
      })),
      outputImagePaths: job.outputImagePaths,
      boardId: job.boardId
    })));
    board.nodes = board.nodes.filter((node) => node.type === "text" || expectedFiles.has(node.imagePath));
    board.thumbnailDataUrl = undefined;
    board.revision = 0;
    // Preserve the original canvas layout and real v1/v2 history; add delivery context only.
    board.nodes.find((node) => node.id === "field-agent-note").text =
      "真实示例 / Real example · 2026-10-16\n\nCLI 生成主图 → 修改配色 → 延展场景 → 制作海报。\n\n橙色是原图，也是其余 3 张的参考。绿色节点保留橙→绿 v1/v2；绿色是编辑变体，不是新的主图。\n\n交付 / Delivery：橙色 hero.png · 户外 scene.png · 海报 campaign.png。\n\n导入与导出已有图不调用模型。重新生成按你的 Provider 计费。";
  } else {
    const parsed = await parseBoardArchive(await readFile(archivePath));
    board = parsed.board;
    jobs = parsed.jobs;
    const localMedia = new Map();
    for (const [relative, bytes] of parsed.images) {
      const local = path.join(tempDir, relative);
      await mkdir(path.dirname(local), { recursive: true });
      await writeFile(local, bytes);
      localMedia.set(relative, local);
    }
    board.nodes = board.nodes.map((node) => node.imagePath ? {
      ...node, imagePath: localMedia.get(node.imagePath),
      versions: node.versions?.map((version) => ({ ...version, imagePath: localMedia.get(version.imagePath) }))
    } : node);
    jobs = jobs.map((job) => ({
      ...job,
      referenceImagePaths: job.referenceImagePaths.map((file) => localMedia.get(file)),
      outputImagePaths: job.outputImagePaths.map((file) => localMedia.get(file))
    }));
  }
  const appVersion = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const archive = await buildBoardArchive(board, jobs, appVersion);
  // Parsing transfers its input to a worker; keep the distribution buffer intact.
  const parsed = await parseBoardArchive(Buffer.from(archive));
  const metadata = JSON.stringify({ board: parsed.board, jobs: parsed.jobs });
  if (/\/Users\/|\/home\/|[A-Za-z]:\\|api[_-]?key|access[_-]?token|providerName|providerId|https?:\/\//i.test(metadata)) {
    throw new Error("Refusing to publish local paths or provider/account metadata.");
  }
  if (parsed.images.size !== 4 || parsed.jobs.length !== 4) throw new Error("FIELD starter is missing documented source material.");
  await writeFile(archivePath, archive);
  const prompts = {
    ...sourcePrompts,
    archive: {
      file: archiveName,
      source: "Original FIELD board and its four successful jobs, exported from the isolated browser development workspace.",
      originalLayout: true,
      originalVersionHistory: true,
      distribution: ".itb contains original generated PNG bytes; site images are the documented WebP copies with unchanged dimensions.",
      privacy: "Provider names/IDs, endpoints, credentials, accounts and local absolute paths are excluded.",
      differences: "Original request: gpt-image-1 via an OpenAI-compatible service, 1024x1024 requested, 1254x1254 actually returned. Saved request style was an empty string after a rejected initial request. Reusing prompts with another provider/model may change size, appearance, typography and reference fidelity."
    },
    assets: sourcePrompts.assets.map((asset) => ({
      ...asset,
      role: asset.reference === null ? "original-and-reference" : asset.operation === "edit_image" ? "edit-variant" : "reference-based-result",
      originalArchivePath: parsed.jobs.find((job) => job.id === asset.jobId).outputImagePaths[0],
      originalSha256: createHash("sha256").update(parsed.images.get(parsed.jobs.find((job) => job.id === asset.jobId).outputImagePaths[0])).digest("hex"),
      delivery: { "field-studio.webp": "hero.png", "field-outdoor.webp": "scene.png", "field-poster.webp": "campaign.png", "field-sage.webp": "sage-variant.png" }[asset.file]
    }))
  };
  await writeFile(path.join(publicDir, "prompts.json"), `${JSON.stringify(prompts, null, 2)}\n`);
  await mkdir(path.join(publicDir, "site/assets"), { recursive: true });
  for (const asset of sourcePrompts.assets) {
    await copyFile(path.join(root, "docs/assets/readme/examples", asset.file), path.join(publicDir, "site/assets", asset.file));
  }
  for (const [source, destination] of [["docs/agent-starter.md", "README.zh-CN.md"], ["docs/agent-starter.en.md", "README.md"]]) {
    const readme = (await readFile(path.join(root, source), "utf8"))
      .replaceAll("(agent-starter.en.md)", "(README.md)")
      .replaceAll("(agent-starter.md)", "(README.zh-CN.md)")
      .replaceAll("(../website/public/examples/field/field-review.mp4)", "(field-review.mp4)")
      .replaceAll("(readme-example.md)", "(https://github.com/Davied-H/iterlay/blob/main/docs/readme-example.md)");
    await writeFile(path.join(publicDir, destination), readme);
  }
  const files = Object.create(null);
  async function addDirectory(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.name === "field-starter.zip") continue;
      if (entry.isDirectory()) await addDirectory(path.join(directory, entry.name), `${relative}/`);
      else files[relative] = new Uint8Array(await readFile(path.join(directory, entry.name)));
    }
  }
  await addDirectory(publicDir);
  await writeFile(path.join(publicDir, "field-starter.zip"), zipSync(files, { level: 6 }));
  console.log(`FIELD starter: ${parsed.images.size} original PNGs, ${parsed.jobs.length} real jobs, original orange → sage version history; ${(archive.length / 1024 / 1024).toFixed(1)} MiB .itb.`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
