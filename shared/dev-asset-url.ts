/** Same-origin asset endpoint served only by the local browser development bridge. */
export const DEV_BROWSER_ASSET_PATH_PREFIX = "/__iterlay_dev/assets/";

const ASSET_URL_PATTERN = /^iterlay-asset:\/\/local\/([A-Za-z0-9_-]+)$/;
const DEV_ASSET_PATH_PATTERN = /^\/__iterlay_dev\/assets\/([A-Za-z0-9_-]+)$/;

/** Keep the signed opaque token intact; never expose a filesystem path to the browser. */
export function toDevBrowserAssetUrl(value: string): string {
  const match = ASSET_URL_PATTERN.exec(value);
  return match ? `${DEV_BROWSER_ASSET_PATH_PREFIX}${match[1]}` : value;
}

/**
 * Restore URLs sent back through the development bridge before calling the real
 * IPC handler. Absolute URLs are accepted only with an explicit matching origin.
 */
export function fromDevBrowserAssetUrl(value: string, origin?: string): string {
  let assetPath = value;
  if (origin && !value.startsWith("/")) {
    try {
      const parsed = new URL(value);
      if (parsed.origin !== new URL(origin).origin || parsed.search || parsed.hash) return value;
      assetPath = parsed.pathname;
    } catch {
      return value;
    }
  }
  const match = DEV_ASSET_PATH_PATTERN.exec(assetPath);
  return match ? `iterlay-asset://local/${match[1]}` : value;
}

export type DevBrowserAssetUrlDirection = "to-browser" | "to-electron";

/**
 * Convert complete URL values in JSON arguments, results, and events. This does
 * not replace substrings inside prompts, serialized JSON, base64, or data URLs.
 * Non-JSON objects are retained rather than flattening buffers or typed arrays.
 */
export function mapDevBrowserAssetUrls<T>(
  value: T,
  direction: DevBrowserAssetUrlDirection,
  origin?: string
): T {
  const convert = direction === "to-browser"
    ? toDevBrowserAssetUrl
    : (url: string) => fromDevBrowserAssetUrl(url, origin);

  function map(item: unknown): unknown {
    if (typeof item === "string") return convert(item);
    if (Array.isArray(item)) return item.map(map);
    if (item && typeof item === "object") {
      const prototype = Object.getPrototypeOf(item);
      if (prototype === Object.prototype || prototype === null) {
        return Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, map(nested)]));
      }
    }
    return item;
  }

  return map(value) as T;
}
