import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "shared", "media-tools-manifest.json");
const currentManifest = await readFile(manifestPath, "utf8").then(JSON.parse, (error) => {
  if (error.code === "ENOENT") return undefined;
  throw error;
});
const args = process.argv.slice(2);
const versionIndex = args.indexOf("--version");
const version = versionIndex < 0 ? currentManifest?.version ?? "ffmpeg6-r1" : args[versionIndex + 1];
const rebuild = args.includes("--rebuild");
const expectedArgs = versionIndex < 0 ? (rebuild ? 1 : 0) : (rebuild ? 3 : 2);
if (!/^ffmpeg6-r[1-9][0-9]*$/u.test(version ?? "") || args.length !== expectedArgs) {
  throw new Error("Usage: pnpm media-tools:build [--version ffmpeg6-r2] [--rebuild]");
}
const artifact = `iterlay-media-tools-${version}-darwin-arm64.zip`;
const versionDir = path.join(root, "output", "media-tools", `${version}-darwin-arm64`);
const sameVersion = currentManifest?.version === version;
if (currentManifest && !sameVersion && Number(version.split("-r")[1]) <= Number(currentManifest.version.split("-r")[1])) {
  throw new Error(`New builds must use a revision newer than ${currentManifest.version}.`);
}
if (sameVersion && !rebuild) {
  const archive = await readFile(path.join(versionDir, artifact)).catch(() => undefined);
  if (!archive || createHash("sha256").update(archive).digest("hex") !== currentManifest.sha256) {
    throw new Error(`${version} is immutable and its matching local archive is missing or changed. Use --version ffmpeg6-r${Number(version.split("-r")[1]) + 1} for a new release, or --rebuild to inspect an isolated candidate.`);
  }
  const { stdout } = await run(process.execPath, [path.join(root, "scripts/verify-packaged-ffmpeg.mjs"), path.join(versionDir, "staging")], { maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(stdout);
  console.log(`Reused immutable ${version} (${currentManifest.sha256}).`);
  process.exit(0);
}
// Same-version rebuilds are diagnostic candidates and never replace a pinned archive.
const outputDir = sameVersion ? path.join(versionDir, "candidate") : versionDir;
const stagingDir = path.join(outputDir, "staging");
if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Media tools currently support macOS ARM64 only.");
if (process.env.ITERLAY_FFMPEG_SOURCE_DIR) throw new Error("Media tool releases must be built from pinned source; prebuilt FFmpeg overrides are not accepted.");
await mkdir(outputDir, { recursive: true });
await rm(stagingDir, { recursive: true, force: true });
await mkdir(stagingDir);
console.log(`Building ${version} into ${stagingDir}`);
await new Promise((resolve, reject) => {
  const child = spawn("bash", [path.join(root, "scripts/build-ffmpeg.sh"), stagingDir], { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg build failed (${code})`)));
});
const binaries = {};
for (const name of ["ffmpeg", "ffprobe"]) {
  const binary = path.join(stagingDir, name);
  const [{ stdout: versionText }, { stdout: dependencies }, { stdout: architecture }] = await Promise.all([
    run(binary, ["-version"]), run("/usr/bin/otool", ["-L", binary]), run("/usr/bin/lipo", ["-archs", binary])
  ]);
  if (versionText.includes("--enable-nonfree")) throw new Error("Nonfree FFmpeg builds must not be distributed.");
  if (/\/opt\/homebrew\/|\/usr\/local\//u.test(dependencies)) throw new Error(`${name} depends on local libraries.`);
  if (architecture.trim() !== "arm64") throw new Error(`${name} is not an ARM64-only binary.`);
  binaries[name] = { version: versionText.trim(), dependencies: dependencies.trim(), architecture: architecture.trim() };
}
const { stdout: compiler } = await run("clang", ["--version"]);
await writeFile(path.join(stagingDir, "licenses", "build-info.json"), `${JSON.stringify({
  version, platform: "darwin", arch: "arm64", minimumMacOS: "14.0", builtAt: new Date().toISOString(),
  compiler: compiler.trim(), buildScript: "licenses/build-ffmpeg.sh", binaries,
  sources: [
    { path: "licenses/ffmpeg-6.0.tar.xz", url: "https://ffmpeg.org/releases/ffmpeg-6.0.tar.xz", sha256: "57be87c22d9b49c112b6d24bc67d42508660e6b718b3db89c44e47e289137082" },
    { path: "licenses/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz", url: "https://github.com/mirror/x264/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz", sha256: "cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9" }
  ]
}, null, 2)}\n`);
const files = [];
async function collect(directory, prefix = "") {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative);
    else {
      if (!entry.isFile()) throw new Error(`Unexpected non-file component entry: ${relative}`);
      const bytes = await readFile(path.join(directory, entry.name));
      files.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength });
    }
  }
}
await collect(stagingDir);
const archivePath = path.join(outputDir, artifact);
await rm(archivePath, { force: true });
await run("/usr/bin/zip", ["-X", "-9", "-q", "-r", archivePath, "ffmpeg", "ffprobe", "licenses"], { cwd: stagingDir });
const archive = await readFile(archivePath);
const manifest = {
  version, platform: "darwin", arch: "arm64",
  url: `https://github.com/Davied-H/iterlay/releases/download/media-tools-${version}/${artifact}`,
  sha256: createHash("sha256").update(archive).digest("hex"), sizeBytes: (await stat(archivePath)).size, files
};
const candidateManifest = path.join(outputDir, "manifest.json");
await writeFile(candidateManifest, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${archivePath} (${manifest.sizeBytes} bytes; sha256 ${manifest.sha256})`);
await run(process.execPath, [path.join(root, "scripts/verify-packaged-ffmpeg.mjs"), stagingDir, "--manifest", candidateManifest], { maxBuffer: 8 * 1024 * 1024 }).then(({ stdout }) => process.stdout.write(stdout));
if (sameVersion && manifest.sha256 !== currentManifest.sha256) {
  throw new Error(`${version} rebuild differs from the pinned archive. Candidate retained at ${outputDir}; use a new --version before publishing. The pinned archive and shared manifest were not changed.`);
}
if (!sameVersion) await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
