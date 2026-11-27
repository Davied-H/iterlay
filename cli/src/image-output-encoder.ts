import type { ImageDeliveryOptions, ProviderImageResult } from "../../shared/types.js";
import { deliveryDimensions, deliveryGeometry } from "../../shared/image-output-delivery.js";

/** Native-free encoder for standalone Node; sharp is already bundled by the CLI. */
export async function encodeNodeImageDelivery(bytes: Buffer, options: ImageDeliveryOptions & { format: "png" | "jpeg" | "webp" }): Promise<ProviderImageResult> {
  const { default: sharp } = await import("sharp");
  let image = sharp(bytes, { limitInputPixels: 32_000_000, animated: false });
  const source = await image.metadata();
  if (!source.width || !source.height || (source.pages ?? 1) > 1) throw new Error("交付源文件不是可处理的静态图片。");
  const target = deliveryDimensions(options.size) ?? { width: source.width, height: source.height };
  const geometry = deliveryGeometry({ width: source.width, height: source.height }, target, options.fit);
  if (geometry.crop.width !== source.width || geometry.crop.height !== source.height) image = image.extract({ left: geometry.crop.x, top: geometry.crop.y, width: geometry.crop.width, height: geometry.crop.height });
  image = image.resize(geometry.resizeWidth, geometry.resizeHeight, { fit: "fill" });
  if (geometry.resizeWidth !== target.width || geometry.resizeHeight !== target.height) image = image.extend({
    left: geometry.offsetX, top: geometry.offsetY,
    right: target.width - geometry.resizeWidth - geometry.offsetX, bottom: target.height - geometry.resizeHeight - geometry.offsetY,
    background: { r: 255, g: 255, b: 255, alpha: options.format === "jpeg" ? 1 : 0 }
  });
  if (options.format === "jpeg") image = image.flatten({ background: "#ffffff" }).jpeg({ quality: options.quality ?? 90 });
  else if (options.format === "webp") image = image.webp({ quality: options.quality ?? 90 });
  else image = image.png();
  return { bytes: await image.toBuffer(), mimeType: options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`, ...target };
}
