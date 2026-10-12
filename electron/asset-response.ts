import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { parseAssetByteRange } from "./asset-byte-range.js";
import { managedAssetMimeFromExtension } from "./storage/asset-store.js";

export async function createAssetResponse(
  request: Request,
  resolveFilePath: (url: string) => string | null
): Promise<Response> {
  const filePath = resolveFilePath(request.url);
  if (!filePath) return new Response("Not found", { status: 404 });
  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile()) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": managedAssetMimeFromExtension(filePath),
    "Cache-Control": "private, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*"
  });
  const requestedRange = request.headers.get("range");
  const range = parseAssetByteRange(requestedRange, file.size);
  if (requestedRange && !range) {
    headers.set("Content-Range", `bytes */${file.size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, file.size - 1);
  const contentLength = file.size === 0 ? 0 : end - start + 1;
  headers.set("Content-Length", String(contentLength));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
  if (request.method === "HEAD" || contentLength === 0) {
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const stream = createReadStream(filePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers
  });
}
