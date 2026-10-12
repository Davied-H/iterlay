import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  migrateLegacyWorkspace,
  rewriteLegacyWorkspacePaths
} from "../electron/workspace-migration";

describe("legacy workspace migration", () => {
  it("rewrites nested asset paths but leaves unrelated absolute paths unchanged", () => {
    const legacyRoot = path.join(os.tmpdir(), "image-relay-studio", "workspace");
    const dataDir = path.join(os.tmpdir(), "Iterlay", "workspace");
    const external = path.join(os.tmpdir(), "external", "image.png");
    const rewritten = rewriteLegacyWorkspacePaths({
      imagePath: path.join(legacyRoot, "outputs", "result.png"),
      versions: [{ imagePath: path.join(legacyRoot, "derived", "edit.png") }],
      external
    }, [legacyRoot], dataDir);

    expect(rewritten.changed).toBe(true);
    expect(rewritten.value).toEqual({
      imagePath: path.join(dataDir, "outputs", "result.png"),
      versions: [{ imagePath: path.join(dataDir, "derived", "edit.png") }],
      external
    });
  });

  it("repairs absolute paths while copying a legacy workspace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-migration-"));
    const appData = path.join(root, "app-data");
    const legacyRoot = path.join(appData, "image-relay-studio", "workspace");
    const dataDir = path.join(appData, "Iterlay", "workspace");
    await mkdir(path.join(legacyRoot, "boards"), { recursive: true });
    await writeFile(path.join(legacyRoot, "boards", "board.json"), JSON.stringify({
      nodes: [{ imagePath: path.join(legacyRoot, "outputs", "result.png") }]
    }), "utf8");

    await migrateLegacyWorkspace(dataDir, appData);

    const migrated = JSON.parse(await readFile(path.join(dataDir, "boards", "board.json"), "utf8")) as {
      nodes: Array<{ imagePath: string }>;
    };
    expect(migrated.nodes[0].imagePath).toBe(path.join(dataDir, "outputs", "result.png"));
  });
});
