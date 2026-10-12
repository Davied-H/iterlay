import { removeConnectedBackground } from "@shared/background-removal";

export interface RemovedBackgroundImage {
  dataUrl: string;
  removedPixels: number;
  alreadyTransparent: boolean;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取待处理图片。"));
    image.src = source;
  });
}

export async function removeImageBackground(source: string): Promise<RemovedBackgroundImage> {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前环境无法处理图片像素。");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = removeConnectedBackground(
    new Uint8Array(imageData.data.buffer),
    canvas.width,
    canvas.height
  );
  if (!result.alreadyTransparent && result.removedPixels > canvas.width * canvas.height * 0.95) {
    throw new Error("未能可靠识别图片主体，请换用主体边缘更清晰的图片。");
  }
  imageData.data.set(result.pixels);
  context.putImageData(imageData, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    removedPixels: result.removedPixels,
    alreadyTransparent: result.alreadyTransparent
  };
}
