import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAssetResponse } from "../electron/asset-response.js";

describe("asset response", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("streams only the requested local video bytes", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-asset-response-"));
    const filePath = path.join(directory, "fixture.mp4");
    await writeFile(filePath, Buffer.from(Array.from({ length: 32 }, (_, index) => index)));

    const response = await createAssetResponse(
      new Request("iterlay-asset://local/fixture", { headers: { Range: "bytes=8-15" } }),
      () => filePath
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 8-15/32");
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("returns 416 for an unsatisfiable range without reading the file", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-asset-response-"));
    const filePath = path.join(directory, "fixture.mp4");
    await writeFile(filePath, Buffer.alloc(16));

    const response = await createAssetResponse(
      new Request("iterlay-asset://local/fixture", { headers: { Range: "bytes=16-" } }),
      () => filePath
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */16");
    expect(await response.text()).toBe("");
  });
});
