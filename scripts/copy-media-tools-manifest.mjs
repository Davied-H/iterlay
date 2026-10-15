import { copyFile, mkdir } from "node:fs/promises";
import { URL } from "node:url";

await mkdir(new URL("../dist-electron/shared/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../shared/media-tools-manifest.json", import.meta.url),
  new URL("../dist-electron/shared/media-tools-manifest.json", import.meta.url)
);
