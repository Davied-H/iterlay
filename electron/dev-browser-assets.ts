import { DEV_BROWSER_ASSET_PATH_PREFIX, fromDevBrowserAssetUrl } from "../shared/dev-asset-url.js";
import { createAssetResponse } from "./asset-response.js";
import type { AssetStore } from "./storage/asset-store.js";

export type DevBrowserAssetResolver = (url: string) => string | null;

/**
 * Serve signed managed assets through the same AssetStore used by Electron.
 * Returns null for unrelated routes so a Vite/Node middleware can handle them.
 * The caller must enforce the development server's loopback/origin restrictions.
 */
export async function createDevBrowserAssetResponse(
  request: Request,
  assets: Pick<AssetStore, "resolveAssetUrl"> | DevBrowserAssetResolver
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(DEV_BROWSER_ASSET_PATH_PREFIX)) return null;

  const assetUrl = fromDevBrowserAssetUrl(pathname);
  let response: Response;
  if (assetUrl === pathname) {
    response = new Response("Not found", { status: 404 });
  } else if (request.method !== "GET" && request.method !== "HEAD") {
    response = new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  } else {
    response = await createAssetResponse(request, () => (
      typeof assets === "function" ? assets(assetUrl) : assets.resolveAssetUrl(assetUrl)
    ));
  }

  // Browser assets are same-origin; avoid inheriting the custom scheme's CORS policy.
  response.headers.delete("Access-Control-Allow-Origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
