import type { NativeImage } from "electron";
import { constrainReferenceImageDimensions } from "../shared/reference-image-limits.js";
import { ProviderError } from "./providers/errors.js";
import type { VideoMediaInput, VideoProviderConfig, VideoSubmitInput } from "./providers/video-types.js";

// Keep the signed JSON envelope below legacy reverse proxies that still cap requests at 1 MiB.
export const OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES = 600 * 1024;
export const OFFICIAL_VIDEO_REFERENCE_MAX_BYTES = OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES;

type NativeImageFactory = (bytes: Buffer) => NativeImage;

export interface NormalizedVideoReferenceImage {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  resized: boolean;
}

export function normalizeOfficialVideoReferenceImage(
  bytes: Buffer,
  mimeType: string,
  createImage: NativeImageFactory,
  maxBytes = OFFICIAL_VIDEO_REFERENCE_MAX_BYTES
): NormalizedVideoReferenceImage {
  const source = createImage(bytes);
  if (source.isEmpty()) {
    throw new ProviderError("INVALID_REFERENCE_IMAGE", "视频参考图片无法解析，请更换图片后重试。");
  }
  const sourceSize = source.getSize();
  const targetSize = constrainReferenceImageDimensions(sourceSize.width, sourceSize.height);
  const dimensionsChanged = targetSize.width !== sourceSize.width || targetSize.height !== sourceSize.height;
  if (!dimensionsChanged && bytes.length <= maxBytes) {
    return { bytes, mimeType, width: sourceSize.width, height: sourceSize.height, resized: false };
  }

  let image = dimensionsChanged ? source.resize({ ...targetSize, quality: "good" }) : source;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const quality of [88, 78, 68, 58]) {
      const encoded = image.toJPEG(quality);
      if (encoded.length <= maxBytes) {
        const size = image.getSize();
        return { bytes: encoded, mimeType: "image/jpeg", width: size.width, height: size.height, resized: true };
      }
    }
    const encoded = image.toJPEG(58);
    const size = image.getSize();
    const scale = Math.min(0.9, Math.sqrt(maxBytes / encoded.length) * 0.9);
    const nextSize = {
      width: Math.max(1, Math.floor(size.width * scale)),
      height: Math.max(1, Math.floor(size.height * scale))
    };
    if (nextSize.width === size.width && nextSize.height === size.height) break;
    image = image.resize({ ...nextSize, quality: "good" });
  }
  throw new ProviderError("REFERENCE_TOO_LARGE", "视频参考图片自动缩小后仍然过大，请更换图片后重试。");
}

export function createVideoSubmitInputNormalizer(createImage: NativeImageFactory) {
  return async (input: VideoSubmitInput, config: VideoProviderConfig): Promise<VideoSubmitInput> => {
    if (config.provider !== "official" || !input.inputs?.some((media) => media.kind === "image" && media.bytes?.length)) {
      return input;
    }
    const imageCount = input.inputs.filter((media) => media.kind === "image" && media.bytes?.length).length;
    const maxBytes = Math.floor(OFFICIAL_VIDEO_REFERENCES_MAX_TOTAL_BYTES / Math.max(1, imageCount));
    const inputs = input.inputs.map((media) => normalizeOfficialVideoMedia(media, createImage, maxBytes));
    return { ...input, inputs };
  };
}

function normalizeOfficialVideoMedia(
  media: VideoMediaInput,
  createImage: NativeImageFactory,
  maxBytes: number
): VideoMediaInput {
  if (media.kind !== "image" || !media.bytes?.length) return media;
  const normalized = normalizeOfficialVideoReferenceImage(media.bytes, media.mimeType, createImage, maxBytes);
  if (!normalized.resized) return media;
  return {
    ...media,
    name: media.name?.replace(/\.[^.]+$/u, ".jpg"),
    bytes: normalized.bytes,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height
  };
}
