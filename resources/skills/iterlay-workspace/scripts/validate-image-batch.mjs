#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: node scripts/validate-image-batch.mjs [--expected WIDTHxHEIGHT] [--ratio W:H] " +
    "[--tolerance DECIMAL] [--allow-mixed-dimensions] <image...>\n"
  );
  process.exit(2);
}

function parsePositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) usage(`${label} must be a positive number.`);
  return number;
}

function parsePair(value, separator, label) {
  const parts = value.toLowerCase().split(separator);
  if (parts.length !== 2) usage(`${label} must use ${separator === "x" ? "WIDTHxHEIGHT" : "W:H"}.`);
  return parts.map((part) => parsePositiveNumber(part, label));
}

function parseArgs(argv) {
  const options = {
    expected: null,
    ratio: null,
    tolerance: 0.001,
    allowMixedDimensions: false,
    paths: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--expected") {
      options.expected = parsePair(argv[++index] ?? "", "x", "--expected");
    } else if (argument === "--ratio") {
      const [width, height] = parsePair(argv[++index] ?? "", ":", "--ratio");
      options.ratio = width / height;
    } else if (argument === "--tolerance") {
      options.tolerance = parsePositiveNumber(argv[++index] ?? "", "--tolerance");
    } else if (argument === "--allow-mixed-dimensions") {
      options.allowMixedDimensions = true;
    } else if (argument.startsWith("--")) {
      usage(`Unknown option: ${argument}`);
    } else {
      options.paths.push(argument);
    }
  }

  if (options.paths.length === 0) usage("At least one image path is required.");
  return options;
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break;
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), format: "jpeg" };
    }
    offset += segmentLength;
  }
  return null;
}

async function dimensionsFor(filePath) {
  const buffer = await readFile(filePath);
  const dimensions = pngDimensions(buffer) ?? jpegDimensions(buffer);
  if (!dimensions) throw new Error("unsupported image format; expected PNG or JPEG");
  if (dimensions.width < 1 || dimensions.height < 1) throw new Error("invalid image dimensions");
  return { path: path.resolve(filePath), ...dimensions, ratio: dimensions.width / dimensions.height };
}

const options = parseArgs(process.argv.slice(2));
const results = [];
const failures = [];

for (const filePath of options.paths) {
  try {
    results.push(await dimensionsFor(filePath));
  } catch (error) {
    failures.push({ path: path.resolve(filePath), reason: error instanceof Error ? error.message : String(error) });
  }
}

if (results.length > 0) {
  const canonical = results[0];
  for (const result of results) {
    if (options.expected) {
      const [expectedWidth, expectedHeight] = options.expected;
      if (result.width !== expectedWidth || result.height !== expectedHeight) {
        failures.push({ path: result.path, reason: `expected ${expectedWidth}x${expectedHeight}, got ${result.width}x${result.height}` });
      }
    }
    if (!options.allowMixedDimensions && (result.width !== canonical.width || result.height !== canonical.height)) {
      failures.push({ path: result.path, reason: `batch dimensions differ from ${canonical.width}x${canonical.height}` });
    }
    if (options.ratio !== null && Math.abs(result.ratio - options.ratio) > options.tolerance) {
      failures.push({ path: result.path, reason: `aspect ratio ${result.ratio.toFixed(6)} differs from ${options.ratio.toFixed(6)}` });
    }
  }
}

const report = {
  ok: failures.length === 0,
  expected: options.expected ? `${options.expected[0]}x${options.expected[1]}` : null,
  ratio: options.ratio,
  tolerance: options.tolerance,
  requireIdenticalDimensions: !options.allowMixedDimensions,
  images: results.map((result) => ({
    path: result.path,
    format: result.format,
    width: result.width,
    height: result.height,
    ratio: Number(result.ratio.toFixed(6))
  })),
  failures
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
