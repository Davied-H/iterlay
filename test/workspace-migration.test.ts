import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  migrateLegacyWorkspace,
  rewriteLegacyWorkspacePaths
} from "../electron/workspace-migration";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readdir: vi.fn(original.readdir) };
});

describe("legacy workspace migration", () => {
  afterEach(() => vi.clearAllMocks());
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

  it("repairs an existing workspace once, without scanning it on later launches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-migration-"));
    try {
      const dataDir = path.join(root, "Iterlay", "workspace");
      const legacyRoot = path.join(root, "ImageRelay Studio", "workspace");
      await mkdir(dataDir, { recursive: true });
      const boardPath = path.join(dataDir, "board.json");
      await writeFile(boardPath, JSON.stringify({ imagePath: path.join(legacyRoot, "image.png") }));
      await migrateLegacyWorkspace(dataDir, root);
      expect(JSON.parse(await readFile(boardPath, "utf8"))).toEqual({ imagePath: path.join(dataDir, "image.png") });

      const scan = vi.mocked(readdir).mockClear();
      await migrateLegacyWorkspace(dataDir, root);
      expect(scan).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retries migration after a scan failure instead of marking it complete", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iterlay-migration-"));
    try {
      const dataDir = path.join(root, "workspace");
      const legacyRoot = path.join(root, "image-relay-studio", "workspace");
      await mkdir(dataDir, { recursive: true });
      const boardPath = path.join(dataDir, "board.json");
      await writeFile(boardPath, JSON.stringify({ imagePath: path.join(legacyRoot, "image.png") }));
      vi.mocked(readdir).mockRejectedValueOnce(new Error("disk unavailable"));
      await expect(migrateLegacyWorkspace(dataDir, root)).rejects.toThrow("disk unavailable");

      await migrateLegacyWorkspace(dataDir, root);
      expect(JSON.parse(await readFile(boardPath, "utf8"))).toEqual({ imagePath: path.join(dataDir, "image.png") });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
