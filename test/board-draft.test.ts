import { describe, expect, it } from "vitest";
import type { GenerateImageInput } from "@shared/types";
import { resetBoardDraft } from "@/lib/board-draft";

describe("board prompt draft", () => {
  it("clears board-owned content and keeps generation preferences", () => {
    const input: GenerateImageInput = {
      workflowMode: "edit",
      useCase: "precise-object-edit",
      sceneId: "scene-1",
      promptSpec: { primaryRequest: "保留主体", subject: "台灯" },
      prompt: "替换背景",
      model: "gpt-image-1.5",
      size: "1536x1024",
      n: 3,
      quality: "medium",
      style: "vivid",
      background: "transparent",
      outputFormat: "png",
      referenceImages: [{
        id: "reference-1",
        name: "reference.png",
        mimeType: "image/png",
        dataBase64: "AAAA",
        role: "edit-target"
      }],
      boardId: "old-board",
      providerId: "provider-1",
      sceneOnly: true
    };

    expect(resetBoardDraft(input)).toEqual({
      workflowMode: "generate",
      useCase: "ads-marketing",
      promptSpec: {
        primaryRequest: "",
        assetType: "",
        inputImages: "",
        sceneBackdrop: "",
        subject: "",
        styleMedium: "",
        compositionFraming: "",
        lightingMood: "",
        colorPalette: "",
        materialsTextures: "",
        verbatimText: "",
        constraints: "",
        avoid: ""
      },
      prompt: "",
      model: "gpt-image-1.5",
      size: "1536x1024",
      n: 3,
      quality: "medium",
      style: "vivid",
      background: "transparent",
      outputFormat: "png",
      referenceImages: []
    });
  });
});
