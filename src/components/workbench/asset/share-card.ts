/** Compose a shareable card image: the original image on top, a dark caption band at the bottom with prompt text. */
export async function composeShareCard(
  imageDataUrl: string,
  prompt: string,
  meta?: string
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const imgW = img.naturalWidth || 512;
  const imgH = img.naturalHeight || 512;

  const PADDING = 24;
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 20;
  const META_FONT_SIZE = 11;
  const META_LINE_HEIGHT = 16;
  const MAX_LINES = 6;
  const BAND_BG = "#1a1a1a";
  const TEXT_COLOR = "#e5e5e5";
  const META_COLOR = "#999";

  // Measure text by creating a temporary canvas context.
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  measureCtx.font = `${FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const maxTextWidth = imgW - PADDING * 2;

  // Wrap prompt text.
  const promptLines = wrapText(measureCtx, prompt || "(No prompt)", maxTextWidth, MAX_LINES);

  // Meta line (optional).
  let metaLines: string[] = [];
  if (meta?.trim()) {
    measureCtx.font = `${META_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
    metaLines = wrapText(measureCtx, meta.trim(), maxTextWidth, 2);
  }

  const bandHeight =
    PADDING +
    promptLines.length * LINE_HEIGHT +
    (metaLines.length > 0 ? 8 + metaLines.length * META_LINE_HEIGHT : 0) +
    PADDING;

  const canvasW = imgW;
  const canvasH = imgH + bandHeight;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // Draw image.
  ctx.drawImage(img, 0, 0, imgW, imgH);

  // Draw caption band.
  ctx.fillStyle = BAND_BG;
  ctx.fillRect(0, imgH, canvasW, bandHeight);

  // Draw prompt text.
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `${FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  let y = imgH + PADDING;
  for (const line of promptLines) {
    ctx.fillText(line, PADDING, y);
    y += LINE_HEIGHT;
  }

  // Draw meta line.
  if (metaLines.length > 0) {
    y += 8;
    ctx.fillStyle = META_COLOR;
    ctx.font = `${META_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
    for (const line of metaLines) {
      ctx.fillText(line, PADDING, y);
      y += META_LINE_HEIGHT;
    }
  }

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split("");
  const lines: string[] = [];
  let current = "";

  for (const char of words) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // Truncate last line if we hit max.
  if (lines.length >= maxLines && current) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth || lines.length > maxLines) {
      lines[maxLines - 1] = last.slice(0, -1) + "...";
    }
  }

  return lines.slice(0, maxLines);
}
