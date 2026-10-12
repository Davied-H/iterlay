const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

export interface DownloadedRemoteImage {
  bytes: Buffer;
  contentType: string;
}

interface DownloadRemoteImageOptions {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

function parseRemoteImageUrl(input: string): URL {
  if (input.length > 8_192) throw new Error("图片链接过长。");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("无法识别图片链接。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("只支持 HTTP 或 HTTPS 图片链接。");
  }
  if (url.username || url.password) throw new Error("图片链接不能包含登录凭据。");
  return url;
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB。`);
  }
  if (!response.body) throw new Error("图片链接未返回内容。");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB。`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("图片链接返回了空文件。");
  return Buffer.concat(chunks, total);
}

export async function downloadRemoteImage(
  input: string,
  options: DownloadRemoteImageOptions = {}
): Promise<DownloadedRemoteImage> {
  const url = parseRemoteImageUrl(input);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8" }
    });
    if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）。`);

    const finalUrl = new URL(response.url || url.href);
    if (finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") {
      throw new Error("图片链接跳转到了不受支持的地址。");
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
      throw new Error("链接内容不是图片。");
    }
    return { bytes: await readBodyWithLimit(response, maxBytes), contentType };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("图片下载超时，请重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function detectRemoteImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  const gifHeader = bytes.toString("ascii", 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  return null;
}
