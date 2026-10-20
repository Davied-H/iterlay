import { nativeImage, type NativeImage } from "electron";
import type { CollaborateSceneRequest } from "../../shared/types.js";
import { constrainReferenceImageDimensions } from "../../shared/reference-image-limits.js";
import { ProviderError } from "../providers/errors.js";

export function normalizeAssistantReferenceImage(
  reference: CollaborateSceneRequest["referenceImages"][number],
  index: number,
  maxBytes: number
): CollaborateSceneRequest["referenceImages"][number] {
  const bytes = Buffer.from(reference.dataBase64, "base64");
  const source = nativeImage.createFromBuffer(bytes);
  if (source.isEmpty()) {
    throw new ProviderError("INVALID_REFERENCE_IMAGE", `第 ${index + 1} 张参考图无法解析，请更换图片后重试。`);
  }
  const sourceSize = source.getSize();
  const targetSize = constrainReferenceImageDimensions(sourceSize.width, sourceSize.height);
  const needsResize = targetSize.width !== sourceSize.width || targetSize.height !== sourceSize.height;
  if (!needsResize && bytes.length <= maxBytes) return reference;

  let normalized = needsResize
    ? source.resize({ ...targetSize, quality: "good" })
    : source;
  let encoded = encodeAssistantReference(normalized, reference.mimeType);
  for (let attempt = 0; encoded.bytes.length > maxBytes && attempt < 5; attempt += 1) {
    const size = normalized.getSize();
    const scale = Math.min(0.9, Math.sqrt(maxBytes / encoded.bytes.length) * 0.9);
    const nextSize = {
      width: Math.max(1, Math.floor(size.width * scale)),
      height: Math.max(1, Math.floor(size.height * scale))
    };
    if (nextSize.width === size.width && nextSize.height === size.height) break;
    normalized = normalized.resize({ ...nextSize, quality: "good" });
    encoded = encodeAssistantReference(normalized, reference.mimeType);
  }
  if (encoded.bytes.length > maxBytes) {
    throw new ProviderError(
      "REFERENCE_TOO_LARGE",
      `第 ${index + 1} 张参考图处理后仍然过大，请缩小尺寸或切分图片后重试。`
    );
  }
  return {
    name: reference.name,
    mimeType: encoded.mimeType,
    dataBase64: encoded.bytes.toString("base64")
  };
}

function encodeAssistantReference(
  image: NativeImage,
  sourceMimeType: string
): { bytes: Buffer; mimeType: "image/jpeg" | "image/png" } {
  if (sourceMimeType === "image/jpeg") {
    return { bytes: image.toJPEG(84), mimeType: "image/jpeg" };
  }
  return { bytes: image.toPNG({ scaleFactor: 1 }), mimeType: "image/png" };
}

