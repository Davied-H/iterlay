/** JSON transport for the structured values used by the development browser bridge. */
const WIRE_TAG = "__iterlayDevWire";
export const DEV_BROWSER_ATTACHMENT_THRESHOLD = 1024 * 1024;
export type DevBrowserAttachmentWriter = (bytes: Uint8Array<ArrayBuffer>) => number;
export type DevBrowserAttachmentReader = (index: number) => ArrayBuffer | undefined;

export type DevBrowserWireValue = null | boolean | number | string | DevBrowserWireValue[] | {
  [key: string]: DevBrowserWireValue;
};

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  // Bound the argument count even for large video uploads.
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isBase64(value: string): boolean {
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(value)) return false;
  const padding = value.indexOf("=");
  return padding < 0 || (padding >= value.length - 2 && /^={1,2}$/u.test(value.slice(padding)));
}

export function encodeDevBrowserWire(value: unknown, attach?: DevBrowserAttachmentWriter): DevBrowserWireValue {
  if (value === undefined) return { [WIRE_TAG]: "undefined" };
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    const type = value instanceof ArrayBuffer ? "ArrayBuffer" : "Uint8Array";
    if (attach && bytes.byteLength >= DEV_BROWSER_ATTACHMENT_THRESHOLD) {
      const attachmentBytes = bytes.buffer instanceof ArrayBuffer
        ? bytes as Uint8Array<ArrayBuffer>
        : new Uint8Array(bytes);
      const index = attach(attachmentBytes);
      if (!Number.isSafeInteger(index) || index < 0) throw new TypeError("网页调试二进制附件索引无效。");
      return { [WIRE_TAG]: type, attachment: index };
    }
    return { [WIRE_TAG]: type, data: toBase64(bytes) };
  }
  if (Array.isArray(value)) return value.map((item) => encodeDevBrowserWire(item, attach));
  if (typeof value !== "object") throw new TypeError("网页调试通信包含不支持的数据类型。");
  const entries = Object.entries(value).map(([key, item]) => [key, encodeDevBrowserWire(item, attach)] as [string, DevBrowserWireValue]);
  // Preserve ordinary user objects that happen to contain our reserved key.
  if (Object.hasOwn(value, WIRE_TAG)) return { [WIRE_TAG]: "Object", entries };
  return Object.fromEntries(entries);
}

export function decodeDevBrowserWire(value: unknown, readAttachment?: DevBrowserAttachmentReader): unknown {
  if (Array.isArray(value)) return value.map((item) => decodeDevBrowserWire(item, readAttachment));
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && record[WIRE_TAG] === "undefined") return undefined;
  if (keys.length === 2 && Object.hasOwn(record, "attachment")
    && (record[WIRE_TAG] === "ArrayBuffer" || record[WIRE_TAG] === "Uint8Array")
    && typeof record.attachment === "number" && Number.isSafeInteger(record.attachment) && record.attachment >= 0) {
    const bytes = readAttachment?.(record.attachment);
    if (!(bytes instanceof ArrayBuffer)) throw new TypeError("网页调试二进制附件不存在。");
    return record[WIRE_TAG] === "ArrayBuffer" ? bytes : new Uint8Array(bytes);
  }
  if (keys.length === 2 && Object.hasOwn(record, "data")
    && (record[WIRE_TAG] === "ArrayBuffer" || record[WIRE_TAG] === "Uint8Array")
    && typeof record.data === "string" && isBase64(record.data)) {
    const bytes = fromBase64(record.data);
    return record[WIRE_TAG] === "ArrayBuffer" ? bytes.buffer : bytes;
  }
  if (keys.length === 2 && record[WIRE_TAG] === "Object" && Object.hasOwn(record, "entries")
    && Array.isArray(record.entries) && record.entries.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string")) {
    return Object.fromEntries(record.entries.map(([key, item]) => [key, decodeDevBrowserWire(item, readAttachment)]));
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeDevBrowserWire(item, readAttachment)]));
}

export { encodeDevBrowserWire as encodeWire, decodeDevBrowserWire as decodeWire };
