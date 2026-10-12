// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateExtractionDialog } from "../src/components/workbench/TemplateExtractionDialog";
import { createCustomScene } from "../src/lib/scene-library";
import type { TemplateExtractionResult } from "../src/lib/template-workflow";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const extraction: TemplateExtractionResult = {
  input: {
    name: "深色数据主页",
    description: "适合数据密集的移动端个人主页",
    prompt: "视觉风格：深色背景，荧光绿强调色\n用户信息：【头像和昵称】",
    fields: [
      { id: "field-1", label: "视觉风格", value: "深色背景，荧光绿强调色" },
      { id: "field-2", label: "用户信息", value: "【头像和昵称】" }
    ],
    category: "other",
    mode: "generate",
    useCase: "other"
  },
  items: [
    { id: "1", label: "视觉风格", value: "深色背景，荧光绿强调色", category: "retained" },
    { id: "2", label: "用户信息", value: "【头像和昵称】", category: "variable" },
    { id: "3", label: "原图身份", value: "Mr.Bobrovsky，Level 8，70%", category: "ignored" }
  ]
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});

describe("TemplateExtractionDialog", () => {
  it("extracts a series template by default and exposes all review categories", async () => {
    const onExtract = vi.fn().mockResolvedValue(extraction);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TemplateExtractionDialog, {
        open: true,
        source: {
          id: "source-1",
          imageUrl: "data:image/png;base64,AA==",
          imagePath: "/tmp/source.png",
          sourcePrompt: "Mr.Bobrovsky，Level 8，70%",
          workflowMode: "generate",
          useCase: "other"
        },
        onOpenChange: vi.fn(),
        onExtract,
        onSave: vi.fn()
      }));
    });

    const extractButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("提炼模板"));
    await act(async () => {
      extractButton?.click();
      await Promise.resolve();
    });

    expect(onExtract).toHaveBeenCalledWith(
      expect.objectContaining({ id: "source-1" }),
      "generate",
      "series-template",
      expect.any(Function)
    );
    expect(document.body.querySelector<HTMLInputElement>('input[value="深色数据主页"]')).not.toBeNull();
    expect(document.body.textContent).toContain("保留1");
    expect(document.body.textContent).toContain("可变1");
    expect(document.body.textContent).toContain("忽略1");

  });

  it("shows elapsed time and extraction stages while the request is pending", async () => {
    let resolveExtraction: ((result: TemplateExtractionResult) => void) | undefined;
    let publishItems: ((items: TemplateExtractionResult["items"]) => void) | undefined;
    const onExtract = vi.fn((_source, _mode, _scenario, onItems: (items: TemplateExtractionResult["items"]) => void) => new Promise<TemplateExtractionResult>((resolve) => {
      resolveExtraction = resolve;
      publishItems = onItems;
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TemplateExtractionDialog, {
        open: true,
        source: {
          id: "source-1",
          imageUrl: "data:image/png;base64,AA==",
          imagePath: "/tmp/source.png",
          sourcePrompt: "source prompt",
          workflowMode: "generate",
          useCase: "other"
        },
        onOpenChange: vi.fn(),
        onExtract,
        onSave: vi.fn()
      }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(document.body.textContent).toContain("识别画面结构与视觉特征");
    expect(document.body.textContent).toContain("区分可复用规则与可变内容");
    expect(document.body.textContent).toContain("整理为可编辑的模板规则");
    expect(document.body.textContent).toContain("0 秒");

    await act(async () => {
      publishItems?.([extraction.items[0]]);
    });
    expect(document.body.textContent).toContain("已解析的规则");
    expect(document.body.textContent).toContain("视觉风格");

    await act(async () => {
      resolveExtraction?.(extraction);
      await Promise.resolve();
    });
  });

  it("edits an extracted rule inline before saving the template", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TemplateExtractionDialog, {
        open: true,
        source: {
          id: "source-1",
          imageUrl: "data:image/png;base64,AA==",
          imagePath: "/tmp/source.png",
          sourcePrompt: "source prompt",
          workflowMode: "generate",
          useCase: "other"
        },
        onOpenChange: vi.fn(),
        onExtract: vi.fn().mockResolvedValue(extraction),
        onSave
      }));
      await Promise.resolve();
    });

    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[aria-label="编辑视觉风格"]')?.click();
    });
    const contentInput = document.body.querySelector<HTMLTextAreaElement>('textarea[aria-label="规则内容"]');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setValue?.call(contentInput, "深色背景，品牌绿强调色");
      contentInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[aria-label="保存规则修改"]')?.click();
      await Promise.resolve();
    });
    const saveButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "保存模板");
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prompt: expect.stringContaining("品牌绿强调色") }),
      { action: "create" }
    );
  });

  it("asks whether to create or replace when a custom template has the same name", async () => {
    const onExtract = vi.fn().mockResolvedValue(extraction);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingTemplate = createCustomScene(extraction.input, "existing-template");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TemplateExtractionDialog, {
        open: true,
        source: {
          id: "source-1",
          imageUrl: "data:image/png;base64,AA==",
          imagePath: "/tmp/source.png",
          sourcePrompt: "source prompt",
          workflowMode: "generate",
          useCase: "other"
        },
        existingTemplates: [existingTemplate],
        onOpenChange: vi.fn(),
        onExtract,
        onSave
      }));
    });

    const clickButton = async (label: string): Promise<void> => {
      const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent?.trim() === label);
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
    };

    await clickButton("提炼模板");
    await clickButton("保存模板");

    expect(document.body.textContent).toContain("已存在同名模板");
    expect(onSave).not.toHaveBeenCalled();

    await clickButton("覆盖同名模板");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "source-1" }),
      expect.objectContaining({ name: "深色数据主页" }),
      { action: "replace", template: existingTemplate }
    );
  });

  it("can keep the existing template and create another with the same name", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingTemplate = createCustomScene(extraction.input, "existing-template");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(TemplateExtractionDialog, {
        open: true,
        source: {
          id: "source-1",
          imageUrl: "data:image/png;base64,AA==",
          imagePath: "/tmp/source.png",
          sourcePrompt: "source prompt",
          workflowMode: "generate",
          useCase: "other"
        },
        existingTemplates: [existingTemplate],
        onOpenChange: vi.fn(),
        onExtract: vi.fn().mockResolvedValue(extraction),
        onSave
      }));
    });

    const clickButton = async (label: string): Promise<void> => {
      const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent?.trim() === label);
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
    };

    await clickButton("提炼模板");
    await clickButton("保存模板");
    await clickButton("创建新的");

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "source-1" }),
      expect.objectContaining({ name: "深色数据主页" }),
      { action: "create" }
    );
  });
});
