import { describe, expect, it } from "vitest";
import { createNode, savePlan } from "../plugins/short-drama/src/model";
import type { ComicDramaBoardSnapshot, ComicSettingNode } from "../shared/comic-drama";
import { prepareBoardMutationPlan } from "../electron/domain/board-model";
import type { BoardData } from "../shared/types";
const empty: ComicDramaBoardSnapshot = { boardId: "test-board", revision: 3, nodes: [], connections: [], groups: [] };
const settingValues = { title: "雨夜来信", synopsis: "失忆女孩收到一封来自未来的信。", genre: "悬疑", tone: "克制", visualStyle: "电影感", aspectRatio: "9:16", targetDurationSeconds: "30", worldRules: "不能改变已经发生的事" };
describe("short drama plugin production editing", () => {
  it("creates valid story, character and shot plans accepted by the actual board domain", () => {
    const board = { id: empty.boardId, name: "test", kind: "comic-drama", revision: 3, nodes: [], connections: [], groups: [] } as unknown as BoardData;
    const setting = createNode("comic-setting", empty);
    const first = savePlan(empty, setting, settingValues);
    const result = prepareBoardMutationPlan(first, board);
    const snapshot = { ...empty, nodes: result.nodes as ComicDramaBoardSnapshot["nodes"] };
    const character = createNode("comic-character", snapshot);
    const second = savePlan(snapshot, character, { name: "林雨", role: "主角", profile: "寻找哥哥", appearanceAnchors: "短发\n灰外套", visualPrompt: "女孩角色设定图" });
    const nextBoard = { ...board, nodes: result.nodes };
    expect(prepareBoardMutationPlan(second, nextBoard).nodes[0].type).toBe("comic-character");
    expect(second.additions.connections[0].source).toBe(setting.id);
    const withCast = { ...snapshot, nodes: [...snapshot.nodes, ...second.additions.nodes] } as ComicDramaBoardSnapshot;
    const shot = createNode("comic-segment-script", withCast);
    const third = savePlan(withCast, shot, { title: "收到来信", action: "女孩展开信纸", durationSeconds: "6", cameraDirection: "缓慢推进" });
    expect(prepareBoardMutationPlan(third, { ...board, nodes: withCast.nodes }).nodes[0].type).toBe("comic-segment-script");
    expect(third.additions.connections).toHaveLength(2);
  });
  it("preserves old versions while editing and validates duration before submitting", () => {
    const created = savePlan(empty, createNode("comic-setting", empty), settingValues).additions.nodes[0] as ComicSettingNode;
    const snapshot = { ...empty, nodes: [created] };
    const plan = savePlan(snapshot, created, { ...settingValues, title: "新的标题" });
    expect(prepareBoardMutationPlan(plan, { id: empty.boardId, revision: 3, nodes: [created], connections: [], groups: [] } as unknown as BoardData).updatedNodes).toHaveLength(1);
    expect(plan.additions.nodes).toHaveLength(0);
    expect(plan.updates!.nodes[0].versions).toHaveLength(3);
    expect(created.versions).toHaveLength(2);
    expect(() => savePlan(empty, createNode("comic-setting", empty), { ...settingValues, targetDurationSeconds: "NaN" })).toThrow("时长");
    expect(() => savePlan(empty, createNode("comic-segment-script", empty), { title: "test", action: "test", durationSeconds: "0" })).toThrow("时长");
  });
});
