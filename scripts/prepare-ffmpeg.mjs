import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;
const key = `${platform}-${arch}`;
const destination = path.join(root, "resources", "ffmpeg");

const releases = {
  "darwin-arm64": {
    ffmpeg: {
      url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-darwin-arm64.gz",
      sha256: "6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca"
    },
    ffprobe: {
      url: "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffprobe-darwin-arm64.gz",
      sha256: "a4db76bafdb8529312e138fb55aaf143cad21b6d672e2634c9dd07ae83c6a310"
    }
  }
};

const release = releases[key];
if (!release) throw new Error(`No checksum-pinned FFmpeg resources are configured for ${key}.`);

const temporary = await mkdtemp(path.join(os.tmpdir(), `iterlay-ffmpeg-${key}-`));
try {
  const sourceDir = process.env.ITERLAY_FFMPEG_SOURCE_DIR?.trim();
  for (const name of ["ffmpeg", "ffprobe"]) {
    const output = path.join(temporary, name);
    if (sourceDir) {
      await copyFile(path.resolve(sourceDir, name), output).catch((error) => {
        throw new Error(`Failed to copy ${name} from ITERLAY_FFMPEG_SOURCE_DIR=${sourceDir}: ${error instanceof Error ? error.message : String(error)}`);
      });
    } else {
      const archive = `${output}.gz`;
      const response = await globalThis.fetch(release[name].url, { redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`Failed to download ${name} for ${key}: HTTP ${response.status}`);
      await pipeline(response.body, createWriteStream(archive));
      const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
      if (digest !== release[name].sha256) throw new Error(`${name} archive checksum mismatch for ${key}: expected ${release[name].sha256}, received ${digest}`);
      await pipeline(createReadStream(archive), createGunzip(), createWriteStream(output));
    }
    await chmod(output, 0o755);
    await verifyBinary(output, name);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(temporary, destination);
  console.log(`Prepared checksum-verified FFmpeg resources for ${key} in ${path.relative(root, destination)}.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function verifyBinary(filePath, name) {
  await access(filePath);
  if (platform === "darwin") {
    const { stdout } = await run("/usr/bin/file", [filePath]);
    if (!stdout.includes("Mach-O") || !stdout.includes(arch)) throw new Error(`${name} is not a ${key} executable: ${stdout.trim()}`);
  }
  const { stdout } = await run(filePath, ["-version"], { timeout: 15_000 });
  if (!stdout.toLowerCase().includes(name)) throw new Error(`${name} -version returned unexpected output.`);
}
