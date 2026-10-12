import type { CopyImageFormat } from "@shared/types";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

export function extractClipboardImageFiles(
  clipboardData: Pick<DataTransfer, "files" | "items">
): File[] {
  const itemFiles = Array.from(clipboardData.items).flatMap((item) => {
    if (item.kind !== "file") return [];
    const file = item.getAsFile();
    return file?.type.startsWith("image/") ? [file] : [];
  });
  if (itemFiles.length > 0) return itemFiles;
  return Array.from(clipboardData.files).filter((file) => file.type.startsWith("image/"));
}

function isGifBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 6) return false;
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}

async function clipboardPngBlob(source: Blob): Promise<Blob> {
  if (source.type === "image/png") return source;
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG conversion failed")), "image/png");
    });
  } finally {
    bitmap.close();
  }
}

async function clipboardGifBlob(source: Blob): Promise<Blob> {
  const sourceBytes = new Uint8Array(await source.arrayBuffer());
  if (isGifBytes(sourceBytes)) return new Blob([sourceBytes], { type: "image/gif" });

  const bitmap = await createImageBitmap(source);
  try {
    const { applyPalette, GIFEncoder, quantize } = await import("gifenc");
    if (bitmap.width > 65_535 || bitmap.height > 65_535) {
      throw new Error("GIF dimensions exceed the format limit");
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const palette = quantize(pixels, 256, {
      format: "rgba4444",
      oneBitAlpha: 96,
      clearAlpha: true,
      clearAlphaThreshold: 96,
      clearAlphaColor: 0
    });
    const transparentIndex = palette.findIndex((color) => color.length >= 4 && color[3] === 0);
    const indexed = applyPalette(pixels, palette, "rgba4444");
    const gif = GIFEncoder();
    gif.writeFrame(indexed, canvas.width, canvas.height, {
      palette,
      repeat: 0,
      dispose: transparentIndex >= 0 ? 2 : 1,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex)
    });
    gif.finish();
    const encoded = gif.bytes();
    const bytes = new Uint8Array(encoded.byteLength);
    bytes.set(encoded);
    return new Blob([bytes.buffer], { type: "image/gif" });
  } finally {
    bitmap.close();
  }
}

async function writeGifToClipboard(blob: Blob): Promise<void> {
  if (hasImageWorkbenchApi()) {
    await getImageWorkbenchApi().writeClipboardImage({
      mimeType: "image/gif",
      bytes: await blob.arrayBuffer()
    });
    return;
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/gif": blob })]);
}

export async function copyImageDataUrlToClipboard(
  dataUrl: string,
  format: CopyImageFormat = "png"
): Promise<void> {
  if (format === "png") {
    const png = fetch(dataUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load image: ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Clipboard source is not an image");
      return clipboardPngBlob(blob);
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return;
  }

  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`Failed to load image: ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("Clipboard source is not an image");
  await writeGifToClipboard(await clipboardGifBlob(blob));
}
