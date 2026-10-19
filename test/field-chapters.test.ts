import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseBoardArchive } from "../electron/board-archive";
import { resolveFieldChapters } from "../shared/field-chapters";
import { isBoardImageNode } from "../shared/types";

async function importedField() {
  const parsed = await parseBoardArchive(await readFile(new URL("../website/public/examples/field/field-starter.itb", import.meta.url)));
  const jobMap = new Map(parsed.jobs.map((job, index) => [job.id, `imported-job-${index}`]));
  const mapPath = (imagePath: string) => `/isolated/imported/${imagePath.split("/").at(-1)}`;
  const board = {
    ...parsed.board,
    id: "new-board-id",
    name: "重命名后的案例",
    nodes: parsed.board.nodes.map((node, index) => isBoardImageNode(node) ? {
      ...node, id: `imported-node-${index}`, imagePath: mapPath(node.imagePath), jobId: jobMap.get(node.jobId)!,
      versions: node.versions?.map((version) => ({ ...version, imagePath: mapPath(version.imagePath), jobId: jobMap.get(version.jobId)! }))
    } : { ...node, id: `imported-note-${index}` })
  };
  return { board, jobs: parsed.jobs.map((job) => ({ ...job, id: jobMap.get(job.id)! })) };
}

describe("FIELD chapter navigation", () => {
  it("locates the real fixed v1 and v2 after archive import remaps IDs, paths and the board name", async () => {
    const { board, jobs } = await importedField();
    const chapters = resolveFieldChapters(board, jobs);
    expect(chapters.map((chapter) => chapter.id)).toEqual(["source", "color", "scene", "poster", "delivery"]);
    const source = chapters[0].targets[0];
    const color = chapters[1].targets[0];
    expect(source.nodeId).toBe(color.nodeId);
    expect(source.versionIndex).toBe(0);
    expect(color.versionIndex).toBe(1);
    expect(source.imagePath).not.toBe(color.imagePath);
    const node = board.nodes.find((candidate) => candidate.id === source.nodeId)!;
    expect(isBoardImageNode(node) && node.versions?.[0].jobId).toBe(source.jobId);
    expect(chapters[4].targets.map((target) => target.imagePath)).toEqual([
      source.imagePath, chapters[2].targets[0].imagePath, chapters[3].targets[0].imagePath
    ]);
    expect(chapters[4].targets).not.toContainEqual(color);
  });

  it("disables a removed chapter and delivery instead of retaining a stale target", async () => {
    const { board, jobs } = await importedField();
    const poster = resolveFieldChapters(board, jobs)[3].targets[0];
    const changed = { ...board, name: "FIELD · 修改后的案例", nodes: board.nodes.filter((node) => node.id !== poster.nodeId) };
    const chapters = resolveFieldChapters(changed, jobs);
    expect(chapters[3].targets).toEqual([]);
    expect(chapters[4].targets).toEqual([]);
    expect(chapters[1].targets[0].versionIndex).toBe(1);
  });

  it("does not show tutorial chapters on an unrelated board that is merely named FIELD", async () => {
    const { board, jobs } = await importedField();
    expect(resolveFieldChapters({ ...board, name: "FIELD", nodes: [] }, jobs)).toEqual([]);
    expect(resolveFieldChapters(board, jobs.map((job) => ({ ...job, prompt: "different task" })))).toEqual([]);
  });
});
