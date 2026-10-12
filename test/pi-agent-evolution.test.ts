import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PiAgentEvolutionStore } from "../electron/pi-agent-evolution.js";

describe("PiAgentEvolutionStore", () => {
  it("persists verified outcomes and converts them into bounded guidance", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-pi-evolution-"));
    try {
      const store = new PiAgentEvolutionStore(directory);
      await store.start();
      store.record({
        mode: "ui",
        strategy: "fidelity",
        outcome: "completed",
        analysisRegionCount: 14,
        localAssetCount: 3,
        revisionCount: 1
      });
      store.record({
        mode: "ui",
        strategy: "fidelity",
        outcome: "failed",
        analysisRegionCount: 2,
        localAssetCount: 0,
        revisionCount: 2,
        failureKind: "visual"
      });
      await store.flush();

      const guidance = store.getGuidance("ui", "fidelity");
      expect(guidance).toContain("最近 2 次中 1 次完成、1 次未完成");
      expect(guidance).toContain("最终截图逐区与当前原图对比");

      const persisted = JSON.parse(await readFile(path.join(directory, "pi-agent-evolution.json"), "utf8"));
      expect(persisted.outcomes).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
