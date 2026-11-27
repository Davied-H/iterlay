import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { callLocalApi } from "../electron/local-api-client";

describe("local API request lifetime", () => {
  it.each([["status", 30_000], ["verify_image_output", 10 * 60_000]] as const)("allows the correct response window for %s", async (method, timeout) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-local-api-"));
    try {
      await writeFile(path.join(directory, "local-api.json"), JSON.stringify({ port: 12345, token: "local-fixture-token-not-a-real-secret" }));
      const timer = vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
      const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ result: { ok: true } })));
      expect(await callLocalApi(directory, method, {})).toEqual({ ok: true });
      expect(timer).toHaveBeenCalledWith(timeout);
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
