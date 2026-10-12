// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardSummary } from "../shared/types";
import { BoardLibrary, formatStorageSize } from "../src/components/workbench/BoardLibrary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

describe("BoardLibrary layout", () => {
  it("places board filters in the secondary toolbar", async () => {
    const board: BoardSummary = {
      id: "board-1",
      name: "测试画板",
      createdAt: "2026-08-07T08:00:00.000Z",
      updatedAt: "2026-08-07T08:00:00.000Z",
      imageCount: 0
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(BoardLibrary, {
        boards: [board],
        onOpenBoard: vi.fn(),
        onPrefetchBoard: vi.fn(),
        onCreateBoard: vi.fn(),
        onRenameBoard: vi.fn(),
        onDuplicateBoard: vi.fn(),
        onDeleteBoard: vi.fn(async () => undefined),
        onExportBoard: vi.fn(),
        onImportBoard: vi.fn(async () => undefined),
        onImportBoardFiles: vi.fn(async () => undefined),
        onClose: vi.fn()
      }));
    });

    const titleBar = container.querySelector("header");
    const filters = container.querySelector('[role="group"][aria-label="画板筛选"]');

    expect(titleBar).not.toBeNull();
    expect(filters).not.toBeNull();
    expect(titleBar?.contains(filters)).toBe(false);
    expect(container.querySelector("[data-board-controls]")?.contains(filters)).toBe(true);
    expect(titleBar?.textContent).not.toContain("重置");
    expect(container.querySelector('[aria-label="重置筛选与排序"]')).toBeNull();
    const emptyFilter = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="画板筛选"] button')]
      .find((button) => button.textContent?.includes("空画板"));
    await act(async () => emptyFilter?.click());
    const resetButton = container.querySelector<HTMLButtonElement>('[aria-label="重置筛选与排序"]');
    expect(resetButton).not.toBeNull();
    await act(async () => resetButton?.click());
    expect(container.querySelector('[aria-label="重置筛选与排序"]')).toBeNull();
  });

  it("defaults to card mode with the first board instead of a duplicate create action", async () => {
    const board: BoardSummary = {
      id: "board-1",
      name: "测试画板",
      createdAt: "2026-08-07T08:00:00.000Z",
      updatedAt: "2026-08-07T08:00:00.000Z",
      imageCount: 0
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(BoardLibrary, {
        boards: [board],
        onOpenBoard: vi.fn(),
        onPrefetchBoard: vi.fn(),
        onCreateBoard: vi.fn(),
        onRenameBoard: vi.fn(),
        onDuplicateBoard: vi.fn(),
        onDeleteBoard: vi.fn(async () => undefined),
        onExportBoard: vi.fn(),
        onImportBoard: vi.fn(async () => undefined),
        onImportBoardFiles: vi.fn(async () => undefined),
        onClose: vi.fn()
      }));
    });

    const cardGrid = container.querySelector("[data-board-card-grid]");
    const firstCard = cardGrid?.firstElementChild;
    const cardModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="卡片模式"]');
    const sortTrigger = container.querySelector('button[aria-label="画板排序：最近更新"]');

    expect(cardGrid).not.toBeNull();
    expect(firstCard?.hasAttribute("data-board-card-item")).toBe(true);
    expect(container.querySelector("[data-create-board-card]")).toBeNull();
    expect(cardModeButton?.getAttribute("aria-pressed")).toBe("true");
    expect(sortTrigger).not.toBeNull();
    expect(container.querySelector("[data-board-controls]")?.contains(sortTrigger)).toBe(true);
  });

  it("aligns the storage column after the updated column", async () => {
    const board: BoardSummary = {
      id: "board-1",
      name: "测试画板",
      createdAt: "2026-08-07T08:00:00.000Z",
      updatedAt: "2026-08-07T08:00:00.000Z",
      imageCount: 2,
      storageBytes: 12 * 1024 * 1024
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(BoardLibrary, {
        boards: [board],
        onOpenBoard: vi.fn(),
        onPrefetchBoard: vi.fn(),
        onCreateBoard: vi.fn(),
        onRenameBoard: vi.fn(),
        onDuplicateBoard: vi.fn(),
        onDeleteBoard: vi.fn(async () => undefined),
        onExportBoard: vi.fn(),
        onImportBoard: vi.fn(async () => undefined),
        onImportBoardFiles: vi.fn(async () => undefined),
        onClose: vi.fn()
      }));
    });

    const listModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="列表模式"]');
    await act(async () => listModeButton?.click());

    const listHeader = container.querySelector("[data-board-list-header]");
    expect(listHeader?.textContent).toContain("图片最近更新空间操作");
    expect(container.querySelector("[data-board-row]")?.textContent).toContain("12 MB");
    expect(container.querySelector<HTMLElement>("[data-board-row]")?.style.contentVisibility).toBe("");
    expect(container.querySelector<HTMLElement>("[data-board-row]")?.style.containIntrinsicSize).toBe("");
  });

  it("starts inline renaming from the edit icon beside the board name", async () => {
    const board: BoardSummary = {
      id: "board-1",
      name: "测试画板",
      createdAt: "2026-08-07T08:00:00.000Z",
      updatedAt: "2026-08-07T08:00:00.000Z",
      imageCount: 2
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(BoardLibrary, {
        boards: [board],
        activeBoardId: board.id,
        onOpenBoard: vi.fn(),
        onPrefetchBoard: vi.fn(),
        onCreateBoard: vi.fn(),
        onRenameBoard: vi.fn(),
        onDuplicateBoard: vi.fn(),
        onDeleteBoard: vi.fn(async () => undefined),
        onExportBoard: vi.fn(),
        onImportBoard: vi.fn(async () => undefined),
        onImportBoardFiles: vi.fn(async () => undefined),
        onClose: vi.fn()
      }));
    });

    const renameButton = container.querySelector<HTMLButtonElement>('button[aria-label="重命名画板 测试画板"]');
    await act(async () => renameButton?.click());

    const renameInput = container.querySelector<HTMLInputElement>('input[aria-label="重命名画板 测试画板"]');
    expect(renameInput).not.toBeNull();
    expect(renameInput?.value).toBe("测试画板");
  });

  it("formats board storage in MB and GB", () => {
    expect(formatStorageSize(undefined)).toBe("0 MB");
    expect(formatStorageSize(512 * 1024)).toBe("0.5 MB");
    expect(formatStorageSize(12 * 1024 * 1024)).toBe("12 MB");
    expect(formatStorageSize(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });

  it("distinguishes unavailable covers from empty boards and locks search while opening", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const props = {
      boards: [{
        id: "missing-cover", name: "有内容的画板", imageCount: 3,
        createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z"
      }],
      openingBoardId: "missing-cover",
      onOpenBoard: vi.fn(), onPrefetchBoard: vi.fn(), onCreateBoard: vi.fn(),
      onRenameBoard: vi.fn(), onDuplicateBoard: vi.fn(),
      onDeleteBoard: vi.fn(async () => undefined), onExportBoard: vi.fn(),
      onImportBoard: vi.fn(async () => undefined),
      onImportBoardFiles: vi.fn(async () => undefined), onClose: vi.fn()
    };
    await act(async () => root?.render(createElement(BoardLibrary, props)));
    expect(container.querySelector("[data-board-card]")?.textContent).toContain("封面暂不可用");
    expect(container.querySelector<HTMLInputElement>('[aria-label="搜索画板"]')?.disabled).toBe(true);
    expect(container.querySelector("[data-board-card]")?.textContent).toContain("正在打开");
    await act(async () => root?.render(createElement(BoardLibrary, { ...props, boards: [], openingBoardId: null })));
    expect(container.textContent).toContain("你的下一次创作，从这里开始");
    expect(container.querySelector(".board-library-empty")?.textContent).toContain("导入画板");
    expect(container.querySelector<HTMLInputElement>('[aria-label="搜索画板"]')?.disabled).toBe(false);
  });
});
