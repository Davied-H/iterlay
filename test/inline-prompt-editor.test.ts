import { describe, expect, it } from "vitest";
import {
  composeInlinePrompt,
  composeStructuredPromptLines,
  hasInlinePromptVariables,
  hasStructuredPromptFields,
  parseInlinePrompt,
  parseInlinePromptLines,
  parseStructuredPromptLines
} from "../src/components/workbench/InlinePromptEditor";
import { extractClipboardImageFiles } from "../src/lib/clipboard-images";

describe("inline prompt editor helpers", () => {
  it("parses text and multiple inline variables in order", () => {
    expect(parseInlinePrompt("主体是【产品】，场景在【地点】。")) .toEqual([
      { type: "text", value: "主体是" },
      { type: "variable", label: "产品", index: 0 },
      { type: "text", value: "，场景在" },
      { type: "variable", label: "地点", index: 1 },
      { type: "text", value: "。" }
    ]);
  });

  it("composes entered values while retaining empty placeholders", () => {
    expect(composeInlinePrompt("【主体】位于【地点】", ["玻璃香水瓶", ""])).toBe("玻璃香水瓶位于【地点】");
    expect(composeInlinePrompt("【主体】位于【地点】", ["玻璃香水瓶", "巴黎街头"])).toBe("玻璃香水瓶位于巴黎街头");
  });

  it("detects variables without leaking regexp state between calls", () => {
    expect(hasInlinePromptVariables("【主体】与【背景】")).toBe(true);
    expect(parseInlinePrompt("【主体】与【背景】").filter((segment) => segment.type === "variable")).toHaveLength(2);
    expect(hasInlinePromptVariables("普通自由文本")).toBe(false);
  });

  it("parses structured lines and preserves global variable indexes", () => {
    expect(parseInlinePromptLines("任务：广告海报\n主体：【产品】\n背景：【地点】")).toEqual([
      { label: "任务", segments: [{ type: "text", value: "广告海报" }] },
      { label: "主体", segments: [{ type: "variable", label: "产品", index: 0 }] },
      { label: "背景", segments: [{ type: "variable", label: "地点", index: 1 }] }
    ]);
  });

  it("round-trips editable structured fields without changing separators or spacing", () => {
    const source = "任务：广告海报\nSubject: 【产品】\n补充说明";
    const lines = parseStructuredPromptLines(source);

    expect(lines).toEqual([
      { label: "任务", content: "广告海报", separator: "：", spacing: "" },
      { label: "Subject", content: "【产品】", separator: ":", spacing: " " },
      { label: "", content: "补充说明", separator: "", spacing: "" }
    ]);
    expect(composeStructuredPromptLines(lines)).toBe(source);
  });

  it("updates every structured field while preserving the other lines", () => {
    const lines = parseStructuredPromptLines("任务：广告海报\n主体：【产品】\n光线：柔和商业布光");
    lines[0] = { ...lines[0], label: "用途", content: "社媒广告" };
    lines[1] = { ...lines[1], content: "透明玻璃香水瓶" };

    expect(composeStructuredPromptLines(lines)).toBe(
      "用途：社媒广告\n主体：透明玻璃香水瓶\n光线：柔和商业布光"
    );
    expect(hasStructuredPromptFields(composeStructuredPromptLines(lines))).toBe(true);
    expect(hasStructuredPromptFields("只有一行普通提示词")).toBe(false);
  });

  it("extracts pasted image files without consuming non-image clipboard entries", () => {
    const image = { type: "image/png" } as File;
    const text = { type: "text/plain" } as File;
    const clipboardData = {
      items: [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => text },
        { kind: "file", getAsFile: () => image }
      ],
      files: [image]
    } as unknown as Pick<DataTransfer, "files" | "items">;

    expect(extractClipboardImageFiles(clipboardData)).toEqual([image]);
  });

  it("falls back to clipboard files when item access is unavailable", () => {
    const image = { type: "image/webp" } as File;
    const clipboardData = {
      items: [],
      files: [{ type: "application/pdf" }, image]
    } as unknown as Pick<DataTransfer, "files" | "items">;

    expect(extractClipboardImageFiles(clipboardData)).toEqual([image]);
  });
});
