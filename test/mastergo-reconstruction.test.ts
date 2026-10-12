import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendReferenceImageToDecisionMessages,
  buildPageRequirement,
  buildPiAgentSystemPrompt,
  convertPiContextToCompletionMessages,
  createOneShotReferenceImage,
  extractMasterGoLocalAssets,
  extractMasterGoNodeId,
  extractMasterGoHtml,
  extractMasterGoScreenshotPath,
  mergePhotoForegroundInventory,
  mergePhotoLayerSupports,
  normalizeMasterGoError,
  parsePiAgentDecision,
  parseMasterGoProbeResponse,
  validatePhotoLayerAnalysis,
  validateMasterGoUiAnalysis,
  validateMasterGoRevision,
  validateReconstructionAgainstAnalysis
} from "../electron/mastergo-bridge.js";

describe("MasterGo editable UI reconstruction", () => {
  it("builds a requirement that explicitly forbids flattening the screenshot", () => {
    const requirement = buildPageRequirement({
      sourceName: "dashboard.png",
      frameName: "数据看板 - 可编辑稿",
      mode: "ui",
      width: 1440,
      height: 1024
    });

    expect(requirement).toContain("1440×1024px");
    expect(requirement).toContain("w-[1440px] h-[1024px]");
    expect(requirement).toContain("独立可编辑图层");
    expect(requirement).toContain("禁止使用随机关键词图片");
    expect(requirement).toContain("不得把原截图作为整页背景");
  });

  it("builds a photo-layer requirement without UI reconstruction instructions", () => {
    const requirement = buildPageRequirement({
      sourceName: "street-photo.jpg",
      frameName: "街景素材",
      mode: "photo-layers",
      width: 1200,
      height: 800
    });

    expect(requirement).toContain("独立位图图层");
    expect(requirement).toContain("独立背景图层");
    expect(requirement).toContain("不要重绘文字、容器、按钮或 CSS UI");
  });

  it("adds summarized evolution guidance without replacing current-task constraints", () => {
    const prompt = buildPiAgentSystemPrompt({
      preparationId: "preparation-1",
      sourcePath: "/tmp/dashboard.png",
      sourceName: "dashboard.png",
      frameName: "数据看板",
      target: "current-page",
      strategy: "fidelity",
      mode: "ui"
    }, [], "历史经验：最终截图逐区与当前原图对比。");

    expect(prompt).toContain("自动进化提示");
    expect(prompt).toContain("当前参考图和本次 MasterGo 官方协议优先");
    expect(prompt).toContain("历史经验：最终截图逐区与当前原图对比。");
  });

  it("adds a preflight subject that the Pi analysis omitted", () => {
    const analysis = mergePhotoForegroundInventory({
      canvasWidth: 1200,
      canvasHeight: 800,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整背景"
      }, {
        name: "woman-person",
        kind: "image",
        x: 430,
        y: 50,
        width: 360,
        height: 730,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "人物"
      }]
    }, [{
      name: "right-traffic-signs",
      description: "右侧路牌",
      x: 830,
      y: 0,
      width: 370,
      height: 700
    }]);

    expect(analysis.regions.map((region) => region.name)).toEqual([
      "photo-background",
      "woman-person",
      "right-traffic-signs"
    ]);
    expect(analysis.regions[2]).toMatchObject({
      handling: "local-asset",
      backgroundMode: "remove-connected"
    });
  });

  it("merges a redundant support pole into its sign layer", () => {
    const analysis = mergePhotoLayerSupports({
      canvasWidth: 1000,
      canvasHeight: 800,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整背景"
      }, {
        name: "advertising-sign",
        kind: "image",
        x: 650,
        y: 100,
        width: 260,
        height: 320,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: true,
        description: "右侧广告牌"
      }, {
        name: "sign-support-pole",
        kind: "image",
        x: 750,
        y: 400,
        width: 55,
        height: 400,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "广告牌支撑杆"
      }]
    });

    expect(analysis.regions.map((region) => region.name)).toEqual(["photo-background", "advertising-sign"]);
    expect(analysis.regions[1]).toMatchObject({ x: 650, y: 100, width: 260, height: 700 });
  });

  it("keeps complete sign layers independent and never merges them into the background", () => {
    const analysis = mergePhotoLayerSupports({
      canvasWidth: 1396,
      canvasHeight: 1127,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1396,
        height: 1127,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整背景，原图中包含路牌和广告牌"
      }, {
        name: "traffic-sign-speed-limit",
        kind: "image",
        x: 932,
        y: 0,
        width: 464,
        height: 299,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: true,
        description: "右上角大型圆形限速路牌"
      }, {
        name: "traffic-sign-no-horn-pole",
        kind: "image",
        x: 940,
        y: 258,
        width: 405,
        height: 869,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: true,
        description: "禁止鸣笛牌以及下方白色立柱"
      }]
    });

    expect(analysis.regions.map((region) => region.name)).toEqual([
      "photo-background",
      "traffic-sign-speed-limit",
      "traffic-sign-no-horn-pole"
    ]);
    expect(analysis.regions[0]).toMatchObject({ x: 0, y: 0, width: 1396, height: 1127 });
  });

  it("merges a named pole only into the nearest sign", () => {
    const analysis = mergePhotoLayerSupports({
      canvasWidth: 1000,
      canvasHeight: 900,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1000,
        height: 900,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整背景"
      }, {
        name: "left-advertising-sign",
        kind: "image",
        x: 80,
        y: 120,
        width: 240,
        height: 260,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: true,
        description: "左侧广告牌"
      }, {
        name: "right-no-horn-sign",
        kind: "image",
        x: 650,
        y: 160,
        width: 240,
        height: 280,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: true,
        description: "右侧禁止鸣笛牌"
      }, {
        name: "traffic-sign-pole",
        kind: "image",
        x: 745,
        y: 420,
        width: 48,
        height: 410,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "白色立柱"
      }]
    });

    expect(analysis.regions.map((region) => region.name)).toEqual([
      "photo-background",
      "left-advertising-sign",
      "right-no-horn-sign"
    ]);
    expect(analysis.regions[1]).toMatchObject({ x: 80, y: 120, width: 240, height: 260 });
    expect(analysis.regions[2]).toMatchObject({ x: 650, y: 160, width: 240, height: 670 });
  });

  it("extracts the single MasterGo main node from a fenced response", () => {
    const html = extractMasterGoHtml(`
这里是结果：
\`\`\`html
<main data-name="Dashboard" class="flex flex-col w-[1440px] min-h-[900px]">
  <div data-name="Header" class="flex flex-row w-[1440px] h-[64px]">
    <span data-name="Title" class="text-[20px] leading-[28px] font-[700] text-[#111111] text-left">数据看板</span>
  </div>
</main>
\`\`\`
`);

    expect(html.startsWith("<main")).toBe(true);
    expect(html.endsWith("</main>")).toBe(true);
    expect(html).not.toContain("```");
  });

  it("ignores a prose main example before the real editable page", () => {
    const html = extractMasterGoHtml(`
已完成自检，根节点为 \`<main data-name="错误示例">\`。
- 所有 DOM 节点均包含 \`data-name\`。
- 未使用原生表单。

\`\`\`html
<main data-name="Travel Card" class="flex flex-col w-[604px] min-h-[856px]">
  <div data-name="Hero" class="flex flex-row w-[564px] h-[454px]">
    <img data-name="Grassland" src="{{green grassland}}" class="w-[564px] h-[454px]" />
  </div>
  <div data-name="Content" class="flex flex-col w-[564px] min-h-[300px]">
    <span data-name="Title" class="text-[48px] leading-[58px] font-[800] text-[#20272B] text-left">青原草地</span>
    <p data-name="Description" class="w-[520px] text-[23px] leading-[40px] font-[400] text-[#686A6F] text-left">广袤的青色草原，微风拂过，草浪起伏。</p>
  </div>
</main>
\`\`\`
`);

    expect(html).toContain('data-name="Travel Card"');
    expect(html).not.toContain("所有 DOM 节点");
    expect(html.match(/<main\b/gu)).toHaveLength(1);
  });

  it("rejects flattened or unsafe reconstruction output", () => {
    expect(() => extractMasterGoHtml("<img src=\"data:image/png;base64,abc\" />")).toThrow(
      "未能生成符合 MasterGo 协议"
    );
    expect(() => extractMasterGoHtml(
      `<main data-name="Unsafe">${"x".repeat(220)}<script>alert(1)</script></main>`
    )).toThrow("不支持的节点");
    expect(() => extractMasterGoHtml(
      `<main data-name="Leaked">${"所有 DOM 节点均包含 data-name。".repeat(20)}</main>`
    )).toThrow("混入了 MasterGo 协议说明");
  });

  it("turns local MCP connection failures into beginner-facing guidance", () => {
    expect(normalizeMasterGoError(
      new Error("no online mg canvas."),
      "fallback"
    )).toContain("确认客户端和目标文件仍保持打开");
  });

  it("reads the active MasterGo document from the stable variables endpoint", () => {
    expect(parseMasterGoProbeResponse(true, JSON.stringify({
      success: true,
      data: {
        documentName: "新文件",
        documentId: "200429232229749",
        variables: []
      }
    }))).toEqual({
      status: "connected",
      documentName: "新文件",
      documentId: "200429232229749"
    });

    expect(parseMasterGoProbeResponse(true, JSON.stringify({
      success: false,
      message: "no online mg canvas."
    }))).toEqual({ status: "offline-canvas" });
  });

  it("leaves MasterGo completion judgment to the Pi agent", () => {
    const accepted = [
      "✅ 设计稿生成请求已发送到 MasterGo，画布仍在后台处理中",
      "- 请求 ID: request-1",
      "- 节点 ID: 123:456",
      "- 状态: accepted（已受理，非最终渲染完成回执）"
    ].join("\n");

    expect(extractMasterGoNodeId(accepted)).toBe("123:456");
    expect(extractMasterGoNodeId(
      "已创建占位层（placeholderNodeId: 321:654）",
      "placeholderNodeId"
    )).toBe("321:654");

    const prompt = buildPiAgentSystemPrompt({
      preparationId: "prepare-1",
      sourcePath: "/tmp/dashboard.png",
      sourceName: "dashboard.png",
      width: 1440,
      height: 1024,
      frameName: "Dashboard",
      target: "current-page",
      strategy: "fidelity",
      mode: "ui"
    });
    expect(prompt).toContain("自主选择工具");
    expect(prompt).toContain("第一轮不会提供参考图片");
    expect(prompt).toContain("一次性提供参考图片");
    expect(prompt).toContain("record_ui_analysis");
    expect(prompt).toContain("w-[1440px] h-[1024px]");
    expect(prompt).toContain("严禁使用 {{英文关键词}}");
    expect(prompt).toContain("不得因为提交被 accepted");
    expect(prompt).toContain("complete_reconstruction");
    expect(prompt).toContain("review_mastergo_visual");
    expect(prompt).toContain("containsEmbeddedUi");
  });

  it("injects the reference image into exactly one model request", () => {
    const image = {
      data: "QUJDRA==",
      mimeType: "image/png",
      byteLength: 4
    };
    const takeImage = createOneShotReferenceImage(image);

    const first = appendReferenceImageToDecisionMessages(
      [{ role: "user", content: "MasterGo 规则已返回" }],
      takeImage()
    );
    const later = appendReferenceImageToDecisionMessages(
      [{ role: "user", content: "继续核验" }],
      takeImage()
    );

    expect(JSON.stringify(first)).toContain("data:image/png;base64,QUJDRA==");
    expect(JSON.stringify(first)).toContain("唯一一次提供参考图片");
    expect(JSON.stringify(first)).toContain("record_ui_analysis");
    expect(JSON.stringify(first)).toContain("本轮不要提交 HTML");
    expect(JSON.stringify(later)).not.toContain("data:image");
    expect(later).toEqual([{ role: "user", content: "继续核验" }]);
  });

  it("keeps MasterGo screenshot images in the Pi model context", () => {
    const messages = convertPiContextToCompletionMessages({
      systemPrompt: "视觉检查",
      tools: [],
      messages: [{
        role: "toolResult",
        toolCallId: "review-1",
        toolName: "review_mastergo_visual",
        content: [
          { type: "text", text: "最终截图" },
          { type: "image", data: "QUJDRA==", mimeType: "image/png" }
        ],
        details: {},
        isError: false,
        timestamp: Date.now()
      }]
    });
    const serialized = JSON.stringify(messages);
    expect(serialized).toContain("最终截图");
    expect(serialized).toContain("data:image/png;base64,QUJDRA==");
  });

  it("parses one Pi tool decision and rejects attempts to escape its tool boundary", () => {
    const allowed = new Set(["prepare_mastergo", "submit_editable_ui"]);
    expect(parsePiAgentDecision(
      "```json\n{\"text\":\"读取规则\",\"toolCalls\":[{\"name\":\"prepare_mastergo\",\"arguments\":{}}]}\n```",
      allowed
    )).toEqual({
      text: "读取规则",
      toolCalls: [{ name: "prepare_mastergo", arguments: {} }]
    });
    expect(() => parsePiAgentDecision(
      "{\"text\":\"\",\"toolCalls\":[{\"name\":\"shell\",\"arguments\":{}}]}",
      allowed
    )).toThrow("未授权工具");
    expect(() => parsePiAgentDecision(
      "{\"text\":\"并行执行\",\"toolCalls\":[{\"name\":\"prepare_mastergo\",\"arguments\":{}},{\"name\":\"submit_editable_ui\",\"arguments\":{}}]}",
      allowed
    )).toThrow("每轮只能调用一个工具");
  });

  it("keeps the official Vibe MCP flow token-free", () => {
    const requirement = buildPageRequirement({
      sourceName: "mobile.png",
      frameName: "移动端页面",
      mode: "ui"
    });

    expect(requirement).not.toMatch(/token|个人令牌/iu);
  });

  it("validates the Pi analysis against the exact source size and crop bounds", () => {
    const valid = validateMasterGoUiAnalysis({
      canvasWidth: 853,
      canvasHeight: 1844,
      regions: [{
        name: "black-cat",
        kind: "image",
        x: 60,
        y: 1050,
        width: 793,
        height: 794,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "黑猫照片"
      }]
    }, { width: 853, height: 1844 });
    expect(valid.canvasWidth).toBe(853);

    expect(() => validateMasterGoUiAnalysis({
      canvasWidth: 1440,
      canvasHeight: 1844,
      regions: valid.regions
    }, { width: 853, height: 1844 })).toThrow("完全一致");

    expect(() => validateMasterGoUiAnalysis({
      canvasWidth: 853,
      canvasHeight: 1844,
      regions: [{ ...valid.regions[0], x: 61 }]
    }, { width: 853, height: 1844 })).toThrow("超出原图");

    const normalized = validateMasterGoUiAnalysis({
      canvasWidth: 853,
      canvasHeight: 1844,
      regions: [{ ...valid.regions[0], name: "Black Cat" }]
    }, { width: 853, height: 1844 });
    expect(normalized.regions[0]?.name).toBe("black-cat");
  });

  it("crops Pi-selected regions into MasterGo-relative local assets", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "iterlay-mastergo-assets-"));
    const cropCalls: Array<{
      rect: { x: number; y: number; width: number; height: number };
      removeConnectedBackground?: boolean;
      segmentationMode?: "connected-color" | "foreground-instance" | "person-instance";
      fillSubjectInterior?: boolean;
    }> = [];
    try {
      const analysis = validateMasterGoUiAnalysis({
        canvasWidth: 853,
        canvasHeight: 1844,
        regions: [{
          name: "black-cat",
          kind: "image",
          x: 60,
          y: 1050,
          width: 793,
          height: 794,
          handling: "local-asset",
          backgroundMode: "remove-connected",
          containsEmbeddedUi: false,
          description: "黑猫照片"
        }]
      }, { width: 853, height: 1844 });
      const assets = await extractMasterGoLocalAssets(
        analysis,
        "/tmp/source.png",
        workspace,
        "task-1",
        {
          getSize: async () => ({ width: 853, height: 1844 }),
          crop: async (_sourcePath, rect, options) => {
            cropCalls.push({
              rect,
              removeConnectedBackground: options?.removeConnectedBackground,
              segmentationMode: options?.segmentationMode
            });
            return Buffer.from("cropped-png");
          }
        }
      );

      expect(cropCalls).toEqual([{
        rect: { x: 60, y: 1050, width: 793, height: 794 },
        removeConnectedBackground: true,
        segmentationMode: "connected-color"
      }]);
      expect(assets[0]?.backgroundMode).toBe("remove-connected");
      expect(assets[0]?.src).toBe("./asset/task-1/black-cat.png");
      expect(await readFile(path.join(
        workspace,
        ".mastergo",
        "created",
        "asset",
        "task-1",
        "black-cat.png"
      ), "utf8")).toBe("cropped-png");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses foreground instance segmentation for photo subject layers", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "iterlay-photo-assets-"));
    const segmentationModes: Array<string | undefined> = [];
    try {
      const analysis = validateMasterGoUiAnalysis({
        canvasWidth: 1200,
        canvasHeight: 800,
        regions: [{
          name: "photo-background",
          kind: "image",
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
          handling: "local-asset",
          backgroundMode: "preserve",
          containsEmbeddedUi: false,
          description: "完整照片底图"
        }, {
          name: "person",
          kind: "image",
          x: 420,
          y: 80,
          width: 360,
          height: 680,
          handling: "local-asset",
          backgroundMode: "remove-connected",
          containsEmbeddedUi: false,
          description: "画面中央人物"
        }]
      }, { width: 1200, height: 800 });

      validatePhotoLayerAnalysis(analysis, { width: 1200, height: 800 });
      await extractMasterGoLocalAssets(
        analysis,
        "/tmp/source.png",
        workspace,
        "photo-task",
        {
          getSize: async () => ({ width: 1200, height: 800 }),
          crop: async (_sourcePath, _rect, options) => {
            segmentationModes.push(options?.segmentationMode);
            return Buffer.from("cropped-png");
          }
        },
        "photo-layers"
      );

      expect(segmentationModes).toEqual(["person-instance", undefined]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("builds the photo background after subject masks are available", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "iterlay-clean-photo-background-"));
    const cleanedWith: string[] = [];
    try {
      const analysis = validateMasterGoUiAnalysis({
        canvasWidth: 100,
        canvasHeight: 80,
        regions: [{
          name: "photo-background",
          kind: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          handling: "local-asset",
          backgroundMode: "preserve",
          containsEmbeddedUi: false,
          description: "完整背景"
        }, {
          name: "vase-object",
          kind: "image",
          x: 20,
          y: 10,
          width: 30,
          height: 60,
          handling: "local-asset",
          backgroundMode: "remove-connected",
          containsEmbeddedUi: false,
          description: "独立花瓶摆件"
        }]
      }, { width: 100, height: 80 });

      await extractMasterGoLocalAssets(
        analysis,
        "/tmp/source.png",
        workspace,
        "clean-background-task",
        {
          getSize: async () => ({ width: 100, height: 80 }),
          crop: async () => Buffer.from("subject-mask"),
          cleanBackground: async (_sourcePath, subjects) => {
            cleanedWith.push(...subjects.map(({ x, y, width, height }) => `${x},${y},${width},${height}`));
            return Buffer.from("clean-background");
          }
        },
        "photo-layers"
      );

      expect(cleanedWith).toEqual(["20,10,30,60"]);
      expect(await readFile(path.join(
        workspace,
        ".mastergo",
        "created",
        "asset",
        "clean-background-task",
        "photo-background.png"
      ), "utf8")).toBe("clean-background");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("lets the image model repair a hard object when local segmentation fails", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "iterlay-photo-model-repair-"));
    const calls: string[] = [];
    try {
      const analysis = validateMasterGoUiAnalysis({
        canvasWidth: 100,
        canvasHeight: 80,
        regions: [{
          name: "photo-background",
          kind: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          handling: "local-asset",
          backgroundMode: "preserve",
          containsEmbeddedUi: false,
          description: "完整背景"
        }, {
          name: "advertising-sign",
          kind: "image",
          x: 60,
          y: 5,
          width: 35,
          height: 60,
          handling: "local-asset",
          backgroundMode: "remove-connected",
          containsEmbeddedUi: true,
          description: "独立广告牌"
        }]
      }, { width: 100, height: 80 });

      await extractMasterGoLocalAssets(
        analysis,
        "/tmp/source.png",
        workspace,
        "model-repair-task",
        {
          getSize: async () => ({ width: 100, height: 80 }),
          crop: async (_sourcePath, _rect, options) => {
            if (options?.removeConnectedBackground) {
              calls.push("local-failed");
              throw new Error("本地蒙版只有碎片");
            }
            calls.push("raw-crop");
            return Buffer.from("raw-sign");
          },
          repairSubject: async (_sourcePath, _region, extracted) => {
            calls.push(`model:${extracted.toString("utf8")}`);
            return Buffer.from("repaired-sign");
          },
          cleanBackground: async (_sourcePath, subjects) => {
            calls.push(`background:${subjects[0]?.bytes.toString("utf8")}`);
            return Buffer.from("clean-background");
          }
        },
        "photo-layers"
      );

      expect(calls).toEqual([
        "local-failed",
        "raw-crop",
        "model:raw-sign",
        "background:repaired-sign"
      ]);
      expect(await readFile(path.join(
        workspace,
        ".mastergo",
        "created",
        "asset",
        "model-repair-task",
        "advertising-sign.png"
      ), "utf8")).toBe("repaired-sign");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses the image model to complete animal subject layers", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "iterlay-animal-model-repair-"));
    const repaired: string[] = [];
    try {
      const analysis = validateMasterGoUiAnalysis({
        canvasWidth: 100,
        canvasHeight: 80,
        regions: [{
          name: "photo-background",
          kind: "image",
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          handling: "local-asset",
          backgroundMode: "preserve",
          containsEmbeddedUi: false,
          description: "完整背景"
        }, {
          name: "golden-retriever-dog",
          kind: "image",
          x: 5,
          y: 10,
          width: 50,
          height: 60,
          handling: "local-asset",
          backgroundMode: "remove-connected",
          containsEmbeddedUi: false,
          description: "完整金毛犬 animal"
        }]
      }, { width: 100, height: 80 });

      await extractMasterGoLocalAssets(
        analysis,
        "/tmp/source.png",
        workspace,
        "animal-repair-task",
        {
          getSize: async () => ({ width: 100, height: 80 }),
          crop: async () => Buffer.from("local-dog"),
          repairSubject: async (_sourcePath, region) => {
            repaired.push(region.name);
            return Buffer.from("complete-dog");
          },
          cleanBackground: async () => Buffer.from("clean-background")
        },
        "photo-layers"
      );

      expect(repaired).toEqual(["golden-retriever-dog"]);
      expect(await readFile(path.join(
        workspace,
        ".mastergo",
        "created",
        "asset",
        "animal-repair-task",
        "golden-retriever-dog.png"
      ), "utf8")).toBe("complete-dog");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects photo pseudo-layers that span almost the whole canvas", () => {
    const analysis = validateMasterGoUiAnalysis({
      canvasWidth: 1200,
      canvasHeight: 800,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整照片底图"
      }, {
        name: "overhead-wires",
        kind: "decoration",
        x: 0,
        y: 0,
        width: 1200,
        height: 220,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "横跨画面的电线"
      }]
    }, { width: 1200, height: 800 });

    expect(() => validatePhotoLayerAnalysis(analysis, { width: 1200, height: 800 }))
      .toThrow("裁切范围过宽");
  });

  it("allows semantically separate photo subjects to use overlapping crops", () => {
    const analysis = validateMasterGoUiAnalysis({
      canvasWidth: 1396,
      canvasHeight: 1127,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1396,
        height: 1127,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整照片底图"
      }, {
        name: "woman",
        kind: "image",
        x: 546,
        y: 58,
        width: 500,
        height: 1069,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "人物"
      }, {
        name: "traffic-signs",
        kind: "image",
        x: 929,
        y: 0,
        width: 467,
        height: 1127,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "路牌"
      }]
    }, { width: 1396, height: 1127 });

    expect(() => validatePhotoLayerAnalysis(analysis, { width: 1396, height: 1127 }))
      .not.toThrow();
  });

  it("rejects a photo layer that combines a person with traffic signs", () => {
    const analysis = validateMasterGoUiAnalysis({
      canvasWidth: 1396,
      canvasHeight: 1127,
      regions: [{
        name: "photo-background",
        kind: "image",
        x: 0,
        y: 0,
        width: 1396,
        height: 1127,
        handling: "local-asset",
        backgroundMode: "preserve",
        containsEmbeddedUi: false,
        description: "完整照片底图"
      }, {
        name: "woman-and-traffic-signs-cluster",
        kind: "image",
        x: 350,
        y: 0,
        width: 1046,
        height: 1127,
        handling: "local-asset",
        backgroundMode: "remove-connected",
        containsEmbeddedUi: false,
        description: "人物与右侧路牌组合"
      }]
    }, { width: 1396, height: 1127 });

    expect(() => validatePhotoLayerAnalysis(analysis, { width: 1396, height: 1127 }))
      .toThrow("人物与路牌");
  });

  it("extracts the saved MasterGo screenshot and validates visual revisions", () => {
    const screenshotResult = [
      "✅ 成功获取并保存预览图（成功 1/1 张）",
      "- [8:1543] /tmp/mastergo workspace/.mastergo/design/8-1543/最终稿_8-1543.png，约 447.2 KB"
    ].join("\n");
    expect(extractMasterGoScreenshotPath(screenshotResult)).toBe(
      "/tmp/mastergo workspace/.mastergo/design/8-1543/最终稿_8-1543.png"
    );

    const validRevision = [
      '<main data-node-id="8:1543" data-name="Page">',
      `<div data-name="Content">${"可编辑内容".repeat(40)}</div>`,
      "</main>"
    ].join("");
    expect(() => validateMasterGoRevision(validRevision, "8:1543")).not.toThrow();
    expect(() => validateMasterGoRevision(validRevision, "9:1")).toThrow("data-node-id");
    expect(() => validateMasterGoRevision(
      validRevision.replace("</main>", "<script>alert(1)</script></main>"),
      "8:1543"
    )).toThrow("不支持");
  });

  it("rejects wrong root size, random images, and omitted extracted assets", () => {
    const constraints = {
      width: 853,
      height: 1844,
      assetSources: ["./asset/task-1/black-cat.png"],
      strategy: "fidelity" as const,
      frameName: "Page",
      mode: "ui" as const
    };
    const valid = [
      '<main data-name="Page" class="flex w-[853px] h-[1844px]">',
      '<img data-name="Cat" src="./asset/task-1/black-cat.png" class="w-[793px] h-[794px]" />',
      '<span data-name="Title">Editable title</span>',
      "</main>"
    ].join("");
    expect(() => validateReconstructionAgainstAnalysis(valid, constraints)).not.toThrow();
    expect(() => validateReconstructionAgainstAnalysis(
      valid.replace("w-[853px] h-[1844px]", "w-[1440px] min-h-[2400px]"),
      constraints
    )).toThrow("固定尺寸");
    expect(() => validateReconstructionAgainstAnalysis(
      valid.replace("./asset/task-1/black-cat.png", "{{black fluffy cat}}"),
      constraints
    )).toThrow("随机关键词图片");
    expect(() => validateReconstructionAgainstAnalysis(
      valid.replace('<img data-name="Cat" src="./asset/task-1/black-cat.png" class="w-[793px] h-[794px]" />', ""),
      constraints
    )).toThrow("未使用");
    expect(() => validateReconstructionAgainstAnalysis(
      valid.replace('data-name="Page"', 'data-name="默认名称"'),
      constraints
    )).toThrow("设计稿名称");
  });
});
