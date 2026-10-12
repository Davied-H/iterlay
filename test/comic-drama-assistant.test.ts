import { describe, expect, it } from "vitest";
import type { ComicCharacterNode, ComicDramaBoardSnapshot, ComicSegmentScriptNode, ComicSettingNode } from "../shared/types";
import {
  comicDramaAssistantContext,
  comicDramaAssistantGuide,
  createComicCharactersMutationPlan,
  createComicDramaMutationPlan
} from "../src/lib/comic-drama-assistant";

const createdAt = "2026-08-22T08:00:00.000Z";
const setting: ComicSettingNode = {
  id: "setting", type: "comic-setting", x: 0, y: 0, status: "saved", activeVersionId: "setting-v1",
  versions: [{ versionId: "setting-v1", createdAt, fields: { title: "雨夜来信", synopsis: "迟到十年的信", genre: "悬疑", tone: "克制", worldRules: [], visualStyle: "冷色手绘", constraints: [], aspectRatio: "9:16", targetDurationSeconds: 30 } }]
};
const character: ComicCharacterNode = {
  id: "character", type: "comic-character", x: 320, y: 0, name: "林默", status: "ready", activeVersionId: "character-v1",
  versions: [{ versionId: "character-v1", createdAt, fields: { role: "修复师", profile: "敏锐", appearanceAnchors: ["短发", "深色外套"], visualPrompt: "冷色手绘角色设定图" } }]
};
const segment: ComicSegmentScriptNode = {
  id: "segment", type: "comic-segment-script", x: 680, y: 0, order: 1, title: "来信", status: "draft", activeVersionId: "segment-v1",
  versions: [{ versionId: "segment-v1", createdAt, fields: { purpose: "引出信件", scene: "修复店", action: "拆信", dialogue: "不该现在出现。", emotion: "警觉", visualDirection: "冷蓝", cameraDirection: "推进", durationSeconds: 6 } }]
};

function snapshot(nodes: ComicDramaBoardSnapshot["nodes"] = []): ComicDramaBoardSnapshot {
  return { boardId: "board", revision: 4, nodes, connections: [], groups: [] };
}

describe("comic drama assistant plans", () => {
  it("previews free initialization without media provider work", () => {
    const result = createComicDramaMutationPlan({ snapshot: snapshot(), selectedNodeIds: [], instruction: "雨夜里一封迟到十年的信" });
    expect(result.baseRevision).toBe(4);
    expect(result.action).toEqual({ kind: "create-setting" });
    expect(result.additions.nodes.map((node) => node.type)).toEqual(["comic-setting"]);
    expect(result.preview.cost).toContain("不调用媒体模型");
    expect(result.preview.additions).toEqual({ nodes: 1, connections: 0, groups: 0 });
  });

  it("proposes the full cast before explicit single or batch creation", () => {
    const proposal = createComicDramaMutationPlan({ snapshot: snapshot([setting]), selectedNodeIds: [], instruction: "规划角色阵容：林默 阿七 反派" });
    expect(proposal.action).toMatchObject({ kind: "propose-characters", characterDrafts: expect.arrayContaining([expect.objectContaining({ required: true, imageCount: 1 })]) });
    expect(proposal.additions.nodes).toEqual([]);
    const drafts = proposal.action?.kind === "propose-characters" ? proposal.action.characterDrafts : [];
    const selected = createComicCharactersMutationPlan({ snapshot: snapshot([setting]), settingNodeId: setting.id, drafts, characterDraftIds: drafts.slice(0, 2).map((draft) => draft.id) });
    expect(selected.action).toMatchObject({ kind: "create-characters", characterDraftIds: expect.any(Array) });
    expect(selected.additions.nodes).toHaveLength(2);
    expect(selected.additions.connections).toHaveLength(2);
    expect(selected.additions.connections).toHaveLength(2);
    for (const connection of selected.additions.connections) {
      expect(connection).toMatchObject({
        source: setting.id,
        kind: "reference",
        versionBinding: { mode: "pinned", versionId: setting.activeVersionId },
        routing: { mode: "auto", kind: "curved", waypoints: [] }
      });
    }
  });

  it("uses Agent-provided structured character names without tokenizing its narrative", () => {
    const proposal = createComicDramaMutationPlan({
      snapshot: snapshot([setting]),
      selectedNodeIds: [setting.id],
      instruction: "为《雨夜来信》规划三人阵容，围绕旧物修复师展开。",
      operation: "propose-characters",
      characterDrafts: [
        { name: "林默", role: "旧物修复师，推动主线", profile: "克制敏锐，因十年前的事故心怀愧疚。", appearanceAnchors: ["28岁", "短黑发", "窄长脸", "深色工作围裙"], visualPrompt: "28岁男性旧物修复师，短黑发，窄长脸，深色工作围裙，冷色手绘角色设定图", visualDescription: "短黑发，深色工作围裙", required: true },
        { name: "阿七", role: "调查寄信人身份的搭档", profile: "行动果断，擅长从旧照片中寻找线索。", appearanceAnchors: ["25岁", "利落短发", "圆眼", "旧相机"], visualPrompt: "25岁女性调查者，利落短发，圆眼，随身携带旧相机，冷色手绘角色设定图", visualDescription: "利落短发，旧相机不离身", required: true },
        { name: "周岚", role: "掌握十年前事故真相", profile: "寡言克制，对旧案始终保持警惕。", appearanceAnchors: ["40岁", "灰白长发", "瘦高", "灰白长外套"], visualPrompt: "40岁瘦高女性，灰白长发，灰白长外套，神情克制，冷色手绘角色设定图", visualDescription: "灰白长外套，神情克制", required: false }
      ]
    });
    expect(proposal.action).toMatchObject({
      kind: "propose-characters",
      characterDrafts: [
        { name: "林默" },
        { name: "阿七" },
        { name: "周岚" }
      ]
    });
    expect(JSON.stringify(proposal.action)).not.toContain("为漫剧");
    expect(JSON.stringify(proposal.action)).not.toContain('"name":"加入"');
  });

  it("rejects Agent cast plans that omit structured character drafts", () => {
    expect(() => createComicDramaMutationPlan({
      snapshot: snapshot([setting]),
      selectedNodeIds: [setting.id],
      instruction: "为漫剧加入角色",
      operation: "propose-characters"
    })).toThrow("没有返回有效的结构化角色阵容");
  });

  it("keeps ordinary character notes in the setting stage until cast planning is explicit", () => {
    const draftSetting = { ...setting, status: "draft" as const };
    const result = createComicDramaMutationPlan({
      snapshot: snapshot([draftSetting]),
      selectedNodeIds: [setting.id],
      instruction: "主角叫林默，是一名旧物修复师"
    });
    expect(result.action).toEqual({ kind: "update-setting", settingNodeId: setting.id });
    expect(result.preview.updates).toEqual({ nodes: 1 });
    expect(result.updates?.nodes).toHaveLength(1);
    expect(result.additions.nodes).toEqual([]);
  });

  it("guides users through setting before exposing the cast action", () => {
    const draftGuide = comicDramaAssistantGuide(snapshot([{ ...setting, status: "draft" }]), [setting.id]);
    expect(draftGuide.stage).toBe("setting");
    expect(draftGuide.message).toContain("只有保存设定后");
    expect(draftGuide.suggestions).toEqual(["我有一个故事想法", "先给我 3 个漫剧方向"]);

    const savedGuide = comicDramaAssistantGuide(snapshot([setting]), [setting.id]);
    expect(savedGuide.stage).toBe("character-design");
    expect(savedGuide.suggestions).toEqual(["规划角色阵容", "我想先调整故事设定"]);

    const generationGuide = comicDramaAssistantGuide(snapshot([setting, character]), [character.id]);
    expect(generationGuide.stage).toBe("character-generation");
    expect(generationGuide.message).toContain("逐个点击“生成形象”");

    const incompleteCharacter = {
      ...character,
      versions: [{ ...character.versions[0], fields: {
        ...character.versions[0].fields,
        profile: "",
        appearanceAnchors: [],
        visualPrompt: ""
      } }]
    };
    const repairGuide = comicDramaAssistantGuide(snapshot([setting, incompleteCharacter]), [character.id]);
    expect(repairGuide.stage).toBe("character-design");
    expect(repairGuide.message).toContain("细节完整后才进入形象生成");
  });

  it("creates a single character with an explicit curved setting reference", () => {
    const draft = { id: "single", name: "林默", role: "主角", profile: "克制敏锐的旧物修复师。", appearanceAnchors: ["短黑发", "深色工作围裙"], visualPrompt: "短黑发旧物修复师，深色工作围裙，冷色手绘角色设定图", visualDescription: "冷色手绘", required: true, imageCount: 1, estimatedCost: 1 };
    const result = createComicCharactersMutationPlan({
      snapshot: snapshot([setting]), settingNodeId: setting.id, drafts: [draft], characterDraftIds: [draft.id]
    });
    expect(result.additions.connections).toEqual([{
      id: expect.any(String),
      source: setting.id,
      target: result.additions.nodes[0]?.id,
      sourceHandle: "source-right",
      targetHandle: "target-left",
      kind: "reference",
      versionBinding: { mode: "pinned", versionId: setting.activeVersionId },
      label: "由此设定派生",
      locked: true,
      sourceAnchor: { side: "right", ratio: 0.5, mode: "pinned" },
      targetAnchor: { side: "left", ratio: 0.5, mode: "pinned" },
      style: { dash: "solid", endMarker: "arrow", markerSize: 9, width: 2 },
      routing: { mode: "auto", kind: "curved", waypoints: [] }
    }]);
    expect(result.additions.nodes[0]).toMatchObject({
      type: "comic-character",
      name: "林默",
      versions: [{
        fields: {
          role: "主角",
          profile: "克制敏锐的旧物修复师。",
          appearanceAnchors: ["短黑发", "深色工作围裙"],
          visualPrompt: "短黑发旧物修复师，深色工作围裙，冷色手绘角色设定图"
        }
      }]
    });
  });

  it("uses selected stable character versions when previewing a segment", () => {
    const current = snapshot([setting, character]);
    expect(comicDramaAssistantContext(current, ["character"])).toBe("角色：林默 · v1");
    const result = createComicDramaMutationPlan({ snapshot: current, selectedNodeIds: ["character"], instruction: "创建片段：林默在雨夜拆开旧信" });
    expect(result.action?.kind).toBe("create-segment");
    expect(result.additions.nodes).toHaveLength(4);
    expect(result.additions.nodes[0]?.type).toBe("comic-segment-script");
    expect(result.additions.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "setting", kind: "reference", versionBinding: { mode: "pinned", versionId: "setting-v1" } }),
      expect.objectContaining({ source: "character", kind: "reference", versionBinding: { mode: "pinned", versionId: "character-v1" } })
    ]));
  });

  it("updates selected characters and segments instead of advancing stages implicitly", () => {
    const characterUpdate = createComicDramaMutationPlan({
      snapshot: snapshot([setting, character]),
      selectedNodeIds: [character.id],
      instruction: "补充：他不愿提起十年前的事故"
    });
    expect(characterUpdate.action).toEqual({ kind: "update-character", characterNodeId: character.id });
    expect(characterUpdate.preview.updates).toEqual({ nodes: 1 });
    expect(characterUpdate.additions.nodes).toEqual([]);

    const segmentUpdate = createComicDramaMutationPlan({
      snapshot: snapshot([setting, character, segment]),
      selectedNodeIds: [segment.id],
      instruction: "把拆信动作改得更迟疑一些"
    });
    expect(segmentUpdate.action).toEqual({ kind: "update-segment", segmentNodeId: segment.id });
    expect(segmentUpdate.preview.updates).toEqual({ nodes: 1 });
    expect(segmentUpdate.additions.nodes).toEqual([]);
  });

  it("applies a complete Agent character revision to an older incomplete card", () => {
    const result = createComicDramaMutationPlan({
      snapshot: snapshot([setting, {
        ...character,
        versions: [{ ...character.versions[0], fields: {
          ...character.versions[0].fields,
          profile: "",
          appearanceAnchors: [],
          visualPrompt: ""
        } }]
      }]),
      selectedNodeIds: [character.id],
      instruction: "补齐林默的完整角色设定",
      operation: "update-character",
      characterDrafts: [{
        name: "林默",
        role: "旧物修复师，推动主线",
        profile: "克制敏锐，因十年前事故心怀愧疚。",
        appearanceAnchors: ["28岁", "短黑发", "深色工作围裙"],
        visualPrompt: "28岁男性旧物修复师，短黑发，深色工作围裙，冷色手绘角色设定图",
        visualDescription: "短黑发，深色工作围裙",
        required: true
      }]
    });
    expect(result.action).toEqual({ kind: "update-character", characterNodeId: character.id });
    expect(result.updates?.nodes[0]).toMatchObject({
      type: "comic-character",
      versions: expect.arrayContaining([expect.objectContaining({
        fields: {
          role: "旧物修复师，推动主线",
          profile: "克制敏锐，因十年前事故心怀愧疚。",
          appearanceAnchors: ["28岁", "短黑发", "深色工作围裙"],
          visualPrompt: "28岁男性旧物修复师，短黑发，深色工作围裙，冷色手绘角色设定图"
        }
      })])
    });
  });

  it("previews first-frame, last-frame, and video intents without submitting generation", () => {
    const result = createComicDramaMutationPlan({ snapshot: snapshot([setting, character, segment]), selectedNodeIds: ["segment"], instruction: "创建媒体链" });
    expect(result.additions.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "generation", comicFrameRole: "first-frame" }),
      expect.objectContaining({ type: "generation", comicFrameRole: "last-frame" }),
      expect.objectContaining({ type: "video-generation" })
    ]));
    expect(result.additions.connections).toHaveLength(6);
    expect(result.additions.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: expect.any(String), targetHandle: "target-start-frame", label: "首帧" }),
      expect.objectContaining({ source: expect.any(String), targetHandle: "target-end-frame", label: "尾帧" })
    ]));
    expect(result.preview.costItems?.map((item) => item.stage)).toEqual(["first-frame", "last-frame", "video"]);
    expect(result.preview.impact).toContain("首帧采用前");
    expect(result.preview.cost).toContain("不产生媒体费用");
  });
});
