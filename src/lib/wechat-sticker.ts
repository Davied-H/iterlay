import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";

export const WECHAT_STICKER_SIZE = 240;
export const WECHAT_STICKER_THUMB_SIZE = 120;
export const WECHAT_STICKER_MAX_BYTES = 500 * 1024;
export const WECHAT_QUICK_ADD_TARGET_BYTES = 96 * 1024;
export const WECHAT_PANEL_ICON_SIZE = 50;
export const WECHAT_PANEL_ICON_MAX_BYTES = 100 * 1024;
export const WECHAT_BANNER_WIDTH = 750;
export const WECHAT_BANNER_HEIGHT = 400;
export const WECHAT_ALBUM_MIN_COUNT = 8;
export const WECHAT_ALBUM_MAX_COUNT = 24;

export type WechatStickerFit = "contain" | "cover";
export type WechatStickerBackground = "transparent" | "white";

export interface WechatStickerRenderOptions {
  fit: WechatStickerFit;
  paddingPercent: number;
  background: WechatStickerBackground;
}

export interface WechatStickerSource {
  id: string;
  name: string;
  dataUrl: string;
}

export interface WechatStickerSequenceFrame {
  source: WechatStickerSource;
  delayMs: number;
}

export interface WechatStickerOutput {
  sourceId: string;
  fileName: string;
  mimeType: "image/gif";
  bytes: Uint8Array;
  previewPngBytes: Uint8Array;
  width: number;
  height: number;
  animated: boolean;
  frameCount: number;
  originalBytes: number;
  warnings: string[];
}

export interface WechatAlbumMetadata {
  name: string;
  description: string;
  copyright: string;
  meanings: string[];
  bannerBackground: string;
}

export interface WechatPackageOutputFile {
  relativePath: string;
  bytes: Uint8Array;
}

export interface WechatPackageBuildResult {
  files: WechatPackageOutputFile[];
  manifest: Record<string, unknown>;
}

export function buildWechatPersonalPackage(stickers: WechatStickerOutput[]): WechatPackageBuildResult {
  const manifest = {
    format: "iterlay-wechat-personal-stickers",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    count: stickers.length,
    stickers: stickers.map((sticker, index) => ({
      file: `stickers/${String(index + 1).padStart(2, "0")}.gif`,
      animated: sticker.animated,
      frames: sticker.frameCount,
      bytes: sticker.bytes.byteLength
    }))
  };
  const files: WechatPackageOutputFile[] = stickers.map((sticker, index) => ({
    relativePath: `stickers/${String(index + 1).padStart(2, "0")}.gif`,
    bytes: sticker.bytes
  }));
  files.push({ relativePath: "manifest.json", bytes: encodeUtf8(JSON.stringify(manifest, null, 2)) });
  files.push({
    relativePath: "README.txt",
    bytes: encodeUtf8([
      "Iterlay 微信个人表情素材",
      "",
      "1. 打开 stickers 目录，把 GIF 作为图片保存到手机系统相册；不要把 ZIP 或图片当作文件直接发送。",
      "2. 打开微信：我 → 表情 → 右上角设置 → 添加的单个表情 → +。",
      "3. 从系统相册选择刚保存的图片。若聊天长按没有“添加到表情”，请始终使用上述入口。",
      "4. 微信没有公开的本地文件一键安装接口，本素材包不会自动修改微信数据。",
      "",
      "所有表情主图均为 240×240 GIF：静态图片使用单帧 GIF，动态图片使用永久循环 GIF，并控制在 500KB 内。"
    ].join("\n"))
  });
  return { files, manifest };
}

interface RenderedGifFrame {
  pixels: Uint8ClampedArray;
  delay: number;
}

interface CanvasSource {
  image: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

export function validateWechatAlbumCount(count: number): string | null {
  if (!Number.isSafeInteger(count) || count < WECHAT_ALBUM_MIN_COUNT || count > WECHAT_ALBUM_MAX_COUNT) {
    return `微信表情专辑需选择 ${WECHAT_ALBUM_MIN_COUNT} 至 ${WECHAT_ALBUM_MAX_COUNT} 张图片。`;
  }
  return null;
}

export function sanitizeWechatStickerName(value: string, fallback = "微信表情"): string {
  return Array.from(value.trim() || fallback)
    .filter((character) => character.charCodeAt(0) >= 32 && !/[\\/:*?"<>|]/.test(character))
    .join("")
    .replace(/\s+/g, " ")
    .slice(0, 48)
    .trim() || fallback;
}

export function formatWechatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function assertWechatStickerFile(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/gif",
  sequence = 1
): void {
  if (bytes.byteLength === 0 || bytes.byteLength > WECHAT_STICKER_MAX_BYTES) {
    throw new Error(`第 ${sequence} 张表情文件为空或超过 500KB。`);
  }
  const dimensions = mimeType === "image/png"
    ? readPngDimensions(bytes)
    : readGifDimensions(bytes);
  if (!dimensions) {
    throw new Error(`第 ${sequence} 张表情不是有效的 ${mimeType === "image/png" ? "PNG" : "GIF"} 文件。`);
  }
  if (dimensions.width !== WECHAT_STICKER_SIZE || dimensions.height !== WECHAT_STICKER_SIZE) {
    throw new Error(`第 ${sequence} 张表情尺寸不是 240×240。`);
  }
}

export async function processWechatSticker(
  source: WechatStickerSource,
  options: WechatStickerRenderOptions,
  sequence: number
): Promise<WechatStickerOutput> {
  const { bytes, mimeType } = decodeImageDataUrl(source.dataUrl);
  if (mimeType === "image/gif" || isGif(bytes)) {
    const animated = await processGifSticker(source.id, bytes, options, sequence);
    if (animated) return animated;
  }
  return processStaticSticker(source.id, bytes, mimeType, options, sequence);
}

export async function processWechatStickerSequence(
  frames: WechatStickerSequenceFrame[],
  options: WechatStickerRenderOptions,
  sequence = 1
): Promise<WechatStickerOutput> {
  if (frames.length === 0) throw new Error("没有可合成的 GIF 帧。");
  const renderedFrames: RenderedGifFrame[] = [];
  let originalBytes = 0;
  for (const frame of frames) {
    const decoded = decodeImageDataUrl(frame.source.dataUrl);
    originalBytes += decoded.bytes.byteLength;
    renderedFrames.push({
      pixels: await renderGifFrameFromBytes(decoded.bytes, decoded.mimeType, options),
      delay: normalizeWechatGifDelay(frame.delayMs)
    });
  }
  const encoded = encodeGifWithinLimit(renderedFrames, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
  assertWechatStickerFile(encoded.bytes, "image/gif", sequence);
  const previewPngBytes = await imageDataToPng(renderedFrames[0].pixels, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
  return {
    sourceId: frames.map((frame) => frame.source.id).join(","),
    fileName: `${String(sequence).padStart(2, "0")}.gif`,
    mimeType: "image/gif",
    bytes: encoded.bytes,
    previewPngBytes,
    width: WECHAT_STICKER_SIZE,
    height: WECHAT_STICKER_SIZE,
    animated: renderedFrames.length > 1,
    frameCount: encoded.frameCount,
    originalBytes,
    warnings: encoded.frameStep > 1
      ? [`为满足 500KB 限制，${renderedFrames.length} 帧已压缩为 ${encoded.frameCount} 帧，相邻帧时长已合并。`]
      : encoded.colors < 128
        ? [`为满足 500KB 限制，动画色彩已压缩为 ${encoded.colors} 色。`]
        : []
  };
}

export function normalizeWechatGifDelay(value: number): number {
  if (!Number.isFinite(value)) return 400;
  return Math.min(10_000, Math.max(20, Math.round(value / 10) * 10));
}

export async function buildWechatStickerPackage(
  stickers: WechatStickerOutput[],
  metadata: WechatAlbumMetadata
): Promise<WechatPackageBuildResult> {
  if (stickers.length === 0) throw new Error("没有可导出的微信表情。");
  const files: WechatPackageOutputFile[] = [];
  for (let index = 0; index < stickers.length; index += 1) {
    const sticker = stickers[index];
    const number = String(index + 1).padStart(2, "0");
    files.push({ relativePath: `stickers/${number}.gif`, bytes: sticker.bytes });
    files.push({
      relativePath: `preview/${number}-thumb.png`,
      bytes: await renderPngFromBytes(sticker.previewPngBytes, "image/png", WECHAT_STICKER_THUMB_SIZE, WECHAT_STICKER_THUMB_SIZE, {
        fit: "contain",
        paddingPercent: 0,
        background: "transparent"
      })
    });
  }

  const representative = stickers[0].previewPngBytes;
  const cover = await renderPngFromBytes(representative, "image/png", WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE, {
    fit: "contain",
    paddingPercent: 8,
    background: "transparent"
  });
  const panelIcon = await renderPngFromBytes(representative, "image/png", WECHAT_PANEL_ICON_SIZE, WECHAT_PANEL_ICON_SIZE, {
    fit: "contain",
    paddingPercent: 8,
    background: "transparent"
  });
  if (panelIcon.byteLength > WECHAT_PANEL_ICON_MAX_BYTES) throw new Error("自动生成的微信面板图标超过 100KB。");
  const banner = await createWechatBanner(representative, metadata);

  files.push({ relativePath: "cover.png", bytes: cover });
  files.push({ relativePath: "panel-icon.png", bytes: panelIcon });
  files.push({ relativePath: "banner.jpg", bytes: banner });

  const manifest = {
    format: "iterlay-wechat-sticker-package",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    album: {
      name: metadata.name,
      description: metadata.description,
      copyright: metadata.copyright,
      type: stickers.some((sticker) => sticker.animated) ? "animated" : "static",
      count: stickers.length
    },
    specifications: {
      sticker: { format: "gif", width: 240, height: 240, maxBytes: WECHAT_STICKER_MAX_BYTES },
      thumbnail: { width: 120, height: 120 },
      cover: { width: 240, height: 240, maxBytes: WECHAT_STICKER_MAX_BYTES },
      panelIcon: { width: 50, height: 50, maxBytes: WECHAT_PANEL_ICON_MAX_BYTES },
      banner: { width: 750, height: 400, maxBytes: WECHAT_STICKER_MAX_BYTES }
    },
    stickers: stickers.map((sticker, index) => ({
      file: `stickers/${String(index + 1).padStart(2, "0")}.gif`,
      thumbnail: `preview/${String(index + 1).padStart(2, "0")}-thumb.png`,
      meaning: metadata.meanings[index] || "",
      animated: sticker.animated,
      frames: sticker.frameCount,
      bytes: sticker.bytes.byteLength
    }))
  };
  files.push({ relativePath: "manifest.json", bytes: encodeUtf8(JSON.stringify(manifest, null, 2)) });
  files.push({ relativePath: "README.txt", bytes: encodeUtf8(createWechatReadme(stickers, metadata)) });
  return { files, manifest };
}

async function processStaticSticker(
  sourceId: string,
  bytes: Uint8Array,
  mimeType: string,
  options: WechatStickerRenderOptions,
  sequence: number
): Promise<WechatStickerOutput> {
  const rendered = await renderPngFromBytes(bytes, mimeType, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE, options);
  const encoded = await encodeStaticGifForQuickAdd(rendered);
  const output = encoded.bytes;
  assertWechatStickerFile(output, "image/gif", sequence);
  return {
    sourceId,
    fileName: `${String(sequence).padStart(2, "0")}.gif`,
    mimeType: "image/gif",
    bytes: output,
    previewPngBytes: rendered,
    width: WECHAT_STICKER_SIZE,
    height: WECHAT_STICKER_SIZE,
    animated: false,
    frameCount: 1,
    originalBytes: bytes.byteLength,
    warnings: encoded.colors < 256
      ? [`为提高微信添加兼容性，静态 GIF 已压缩为 ${encoded.colors} 色（${formatWechatFileSize(output.byteLength)}）。`]
      : output.byteLength > WECHAT_QUICK_ADD_TARGET_BYTES
        ? [`图片符合微信投稿规范，但仍超过快捷添加兼容目标 ${formatWechatFileSize(WECHAT_QUICK_ADD_TARGET_BYTES)}；建议改用白色背景或减少画面细节。`]
        : []
  };
}

async function renderGifFrameFromBytes(
  bytes: Uint8Array,
  mimeType: string,
  options: WechatStickerRenderOptions
): Promise<Uint8ClampedArray> {
  const source = await decodeCanvasSource(bytes, mimeType);
  try {
    const canvas = createCanvas(WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
    renderCanvasSource(source.image, source.width, source.height, canvas, options);
    return get2d(canvas).getImageData(0, 0, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE).data;
  } finally {
    source.dispose();
  }
}

async function encodeStaticGifForQuickAdd(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; colors: number }> {
  const source = await decodeCanvasSource(bytes, "image/png");
  try {
    const canvas = createCanvas(WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
    const context = get2d(canvas);
    context.drawImage(source.image, 0, 0, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
    const frame = {
      pixels: context.getImageData(0, 0, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE).data,
      delay: 100
    };
    let smallest: { bytes: Uint8Array; colors: number } | null = null;
    for (const colors of [256, 128, 64, 32, 16]) {
      const candidate = encodeGif([frame], WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE, colors, 1);
      if (!smallest || candidate.byteLength < smallest.bytes.byteLength) {
        smallest = { bytes: candidate, colors };
      }
      if (candidate.byteLength <= WECHAT_QUICK_ADD_TARGET_BYTES) return { bytes: candidate, colors };
    }
    if (!smallest) throw new Error("静态 GIF 编码失败。");
    return smallest;
  } finally {
    source.dispose();
  }
}

async function processGifSticker(
  sourceId: string,
  bytes: Uint8Array,
  options: WechatStickerRenderOptions,
  sequence: number
): Promise<WechatStickerOutput | null> {
  const parsed = parseGIF(toArrayBuffer(bytes));
  const frames = decompressFrames(parsed, true);
  if (frames.length <= 1) return null;
  const renderedFrames = renderGifFrames(frames, parsed.lsd.width, parsed.lsd.height, options);
  const encoded = encodeGifWithinLimit(renderedFrames, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
  assertWechatStickerFile(encoded.bytes, "image/gif", sequence);
  const previewPngBytes = await imageDataToPng(renderedFrames[0].pixels, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
  return {
    sourceId,
    fileName: `${String(sequence).padStart(2, "0")}.gif`,
    mimeType: "image/gif",
    bytes: encoded.bytes,
    previewPngBytes,
    width: WECHAT_STICKER_SIZE,
    height: WECHAT_STICKER_SIZE,
    animated: true,
    frameCount: encoded.frameCount,
    originalBytes: bytes.byteLength,
    warnings: encoded.frameStep > 1
      ? [`为满足 500KB 限制，动画已合并为约 ${encoded.frameCount} 帧。`]
      : encoded.colors < 128
        ? [`为满足 500KB 限制，动画色彩已压缩为 ${encoded.colors} 色。`]
        : []
  };
}

function renderGifFrames(
  frames: ParsedFrame[],
  sourceWidth: number,
  sourceHeight: number,
  options: WechatStickerRenderOptions
): RenderedGifFrame[] {
  const source = createCanvas(sourceWidth, sourceHeight);
  const sourceContext = get2d(source);
  const patch = createCanvas(sourceWidth, sourceHeight);
  const patchContext = get2d(patch);
  let previousDisposal = 0;
  let previousDims: ParsedFrame["dims"] | null = null;
  let previousRestore: ImageData | null = null;
  const result: RenderedGifFrame[] = [];

  for (const frame of frames) {
    if (previousDisposal === 2 && previousDims) {
      sourceContext.clearRect(previousDims.left, previousDims.top, previousDims.width, previousDims.height);
    } else if (previousDisposal === 3 && previousRestore) {
      sourceContext.putImageData(previousRestore, 0, 0);
    }

    const restore = frame.disposalType === 3
      ? sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
      : null;
    patch.width = frame.dims.width;
    patch.height = frame.dims.height;
    patchContext.clearRect(0, 0, patch.width, patch.height);
    patchContext.putImageData(
      new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height),
      0,
      0
    );
    sourceContext.drawImage(patch, frame.dims.left, frame.dims.top);

    const target = createCanvas(WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE);
    renderCanvasSource(source, sourceWidth, sourceHeight, target, options);
    result.push({
      pixels: get2d(target).getImageData(0, 0, WECHAT_STICKER_SIZE, WECHAT_STICKER_SIZE).data,
      delay: Math.max(20, frame.delay || 100)
    });
    previousDisposal = frame.disposalType;
    previousDims = frame.dims;
    previousRestore = restore;
  }
  return result;
}

function encodeGifWithinLimit(
  frames: RenderedGifFrame[],
  width: number,
  height: number
): { bytes: Uint8Array; colors: number; frameStep: number; frameCount: number } {
  const baseStep = Math.max(1, Math.ceil(frames.length / 180));
  const attempts = [
    { colors: 256, step: baseStep },
    { colors: 128, step: baseStep },
    { colors: 64, step: baseStep },
    { colors: 32, step: baseStep },
    { colors: 24, step: baseStep },
    { colors: 16, step: baseStep },
    { colors: 128, step: baseStep * 2 },
    { colors: 64, step: baseStep * 2 },
    { colors: 32, step: baseStep * 2 },
    { colors: 64, step: baseStep * 3 },
    { colors: 32, step: baseStep * 3 },
    { colors: 24, step: baseStep * 4 },
    { colors: 16, step: baseStep * 6 }
  ];
  let smallest: { bytes: Uint8Array; colors: number; frameStep: number; frameCount: number } | null = null;
  for (const attempt of attempts) {
    const encoded = encodeGif(frames, width, height, attempt.colors, attempt.step);
    if (!smallest || encoded.byteLength < smallest.bytes.byteLength) {
      smallest = { bytes: encoded, colors: attempt.colors, frameStep: attempt.step, frameCount: Math.ceil(frames.length / attempt.step) };
    }
    if (encoded.byteLength <= WECHAT_STICKER_MAX_BYTES) return smallest;
  }
  if (!smallest) throw new Error("动态 GIF 编码失败。");
  return smallest;
}

function encodeGif(
  frames: RenderedGifFrame[],
  width: number,
  height: number,
  colors: number,
  frameStep: number
): Uint8Array {
  const gif = GIFEncoder();
  for (let index = 0; index < frames.length; index += frameStep) {
    const frame = frames[index];
    const delay = frames.slice(index, Math.min(frames.length, index + frameStep))
      .reduce((total, item) => total + item.delay, 0);
    const palette = quantize(frame.pixels, colors, {
      format: "rgba4444",
      oneBitAlpha: 96,
      clearAlpha: true,
      clearAlphaThreshold: 96,
      clearAlphaColor: 0
    });
    const transparentIndex = palette.findIndex((color) => color.length >= 4 && color[3] === 0);
    const indexed = applyPalette(frame.pixels, palette, "rgba4444");
    gif.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: 0,
      dispose: transparentIndex >= 0 ? 2 : 1,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex)
    });
  }
  gif.finish();
  return gif.bytes();
}

async function renderPngFromBytes(
  bytes: Uint8Array,
  mimeType: string,
  width: number,
  height: number,
  options: WechatStickerRenderOptions
): Promise<Uint8Array> {
  const source = await decodeCanvasSource(bytes, mimeType);
  try {
    const canvas = createCanvas(width, height);
    renderCanvasSource(source.image, source.width, source.height, canvas, options);
    return new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
  } finally {
    source.dispose();
  }
}

function renderCanvasSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: HTMLCanvasElement,
  options: WechatStickerRenderOptions
): void {
  const context = get2d(target);
  context.clearRect(0, 0, target.width, target.height);
  if (options.background === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
  }
  const padding = Math.max(0, Math.min(0.25, options.paddingPercent / 100));
  const innerWidth = target.width * (1 - padding * 2);
  const innerHeight = target.height * (1 - padding * 2);
  const scale = options.fit === "cover"
    ? Math.max(innerWidth / sourceWidth, innerHeight / sourceHeight)
    : Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, (target.width - drawWidth) / 2, (target.height - drawHeight) / 2, drawWidth, drawHeight);
}

async function createWechatBanner(sourceBytes: Uint8Array, metadata: WechatAlbumMetadata): Promise<Uint8Array> {
  const source = await decodeCanvasSource(sourceBytes, "image/png");
  try {
    const canvas = createCanvas(WECHAT_BANNER_WIDTH, WECHAT_BANNER_HEIGHT);
    const context = get2d(canvas);
    context.fillStyle = normalizeHexColor(metadata.bannerBackground, "#dff7ef");
    context.fillRect(0, 0, canvas.width, canvas.height);
    const softColor = mixWithWhite(normalizeHexColor(metadata.bannerBackground, "#dff7ef"), 0.55);
    context.fillStyle = softColor;
    context.beginPath();
    context.arc(190, 200, 154, 0, Math.PI * 2);
    context.fill();
    context.drawImage(source.image, 66, 70, 260, 260);
    context.fillStyle = "rgba(15, 23, 20, 0.92)";
    context.font = '700 42px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(metadata.name || "微信表情", 380, 170, 310);
    context.fillStyle = "rgba(15, 23, 20, 0.62)";
    context.font = '400 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    drawWrappedText(context, metadata.description || "由 Iterlay 创作", 380, 212, 300, 32, 2);
    context.font = '500 16px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(metadata.copyright ? `© ${metadata.copyright}` : "Created with Iterlay", 380, 322, 300);
    for (const quality of [0.9, 0.82, 0.72, 0.62]) {
      const bytes = new Uint8Array(await (await canvasToBlob(canvas, "image/jpeg", quality)).arrayBuffer());
      if (bytes.byteLength <= WECHAT_STICKER_MAX_BYTES) return bytes;
    }
    throw new Error("自动生成的微信专辑横幅超过 500KB。");
  } finally {
    source.dispose();
  }
}

async function decodeCanvasSource(bytes: Uint8Array, mimeType: string): Promise<CanvasSource> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType || "image/png" });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("无法解码图片。"));
    element.src = url;
  });
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(url)
  };
}

async function imageDataToPng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const canvas = createCanvas(width, height);
  get2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
}

function decodeImageDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("无法读取待导出的图片数据。");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, mimeType: match[1].toLowerCase() };
}

function isGif(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readGifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 10) return null;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前环境不支持图片画布处理。");
  return context;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片编码失败。")), type, quality);
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function normalizeHexColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function mixWithWhite(color: string, amount: number): string {
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [value >> 16, value >> 8 & 255, value & 255]
    .map((channel) => Math.round(channel + (255 - channel) * amount));
  return `rgb(${channels.join(", ")})`;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): void {
  const characters = Array.from(text);
  let line = "";
  let lineIndex = 0;
  for (const character of characters) {
    const candidate = line + character;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    context.fillText(line, x, y + lineIndex * lineHeight, maxWidth);
    lineIndex += 1;
    if (lineIndex >= maxLines) return;
    line = character;
  }
  if (line && lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight, maxWidth);
}

function createWechatReadme(stickers: WechatStickerOutput[], metadata: WechatAlbumMetadata): string {
  const type = stickers.some((sticker) => sticker.animated) ? "动态" : "静态";
  return [
    `${metadata.name || "微信表情"} · Iterlay 微信表情投稿素材包`,
    "",
    `表情类型：${type}`,
    `表情数量：${stickers.length}`,
    "",
    "目录说明：",
    "- stickers/：240×240 GIF 表情主图，可在微信表情开放平台批量选择上传。",
    "- preview/：120×120 缩略图预览；开放平台通常会自动生成，可用于核对关键帧。",
    "- cover.png：240×240 专辑封面。",
    "- panel-icon.png：50×50 表情面板图标。",
    "- banner.jpg：750×400 专辑横幅。",
    "- manifest.json：表情顺序、含义词和规格记录。",
    "",
    "使用方式：",
    "1. ZIP 仅用于传输和归档，微信表情开放平台不直接导入本 ZIP。",
    "2. 解压后进入微信表情开放平台，新建表情专辑。",
    "3. 批量选择 stickers 目录内的文件，并按 manifest.json 填写含义词。",
    "4. 上传封面、面板图标与横幅，预览无误后提交审核。",
    "5. 若只想添加为个人表情，请把 stickers 中的单张图片保存到手机系统相册，再前往：微信 → 我 → 表情 → 右上角设置 → 添加的单个表情 → +。",
    "6. 不要把 ZIP 或图片当作文件直接发送；聊天长按没有“添加到表情”时，请使用上述相册入口。",
    "",
    "规格核对日期：2026-07-20。微信平台规则可能调整，正式投稿前请以平台页面提示为准。"
  ].join("\n");
}
