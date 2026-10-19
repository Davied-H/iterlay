// @vitest-environment jsdom

import { act,createElement,type ComponentProps,type ReactNode } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { UpdateStateSnapshot } from "../shared/app-update";
import type { LicenseStatusSnapshot } from "../shared/licensing";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testStorage = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() { return testStorage.size; },
    clear: () => testStorage.clear(),
    getItem: (key: string) => testStorage.get(key) ?? null,
    key: (index: number) => [...testStorage.keys()][index] ?? null,
    removeItem: (key: string) => testStorage.delete(key),
    setItem: (key: string, value: string) => testStorage.set(key, value)
  } satisfies Storage
});

vi.mock("framer-motion", async () => {
  const { createElement: renderElement, forwardRef } = await import("react");
  const MotionDiv = forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const rest = { ...props };
    const children = rest.children as ReactNode;
    delete rest.children;
    delete rest.initial;
    delete rest.animate;
    delete rest.exit;
    delete rest.transition;
    return renderElement("div", { ...rest, ref }, children as ReactNode);
  });
  const MotionSpan = forwardRef<HTMLSpanElement, Record<string, unknown>>((props, ref) => {
    const rest = { ...props };
    const children = rest.children as ReactNode;
    delete rest.children;
    delete rest.layoutId;
    delete rest.transition;
    return renderElement("span", { ...rest, ref }, children as ReactNode);
  });
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => children,
    motion: { div: MotionDiv, span: MotionSpan },
    useReducedMotion: () => true
  };
});

vi.mock("@/components/workbench/AssetLibrary", () => ({
  AssetLibrary: ({ playInitialEntrance }: { playInitialEntrance: boolean }) =>
    createElement("div", { "data-play-asset-entrance": String(playInitialEntrance) })
}));
vi.mock("@/components/workbench/BoardLibrary", () => ({ BoardLibrary: () => createElement("div") }));
vi.mock("@/components/workbench/SceneLibrary", () => ({ SceneLibraryPage: () => createElement("div") }));
vi.mock("@/components/workbench/LibraryNavCanvasIcon", () => ({
  LibraryNavCanvasIcon: ({ kind, active }: { kind: string; active: boolean }) =>
    createElement("span", { "data-icon-kind": kind, "data-active": String(active) })
}));

import { LicenseContext } from "../src/components/licensing/license-context";
import { UpdateContext } from "../src/components/update/update-context";
import { LibraryShell as LibraryShellComponent } from "../src/components/workbench/LibraryShell";
import { I18nProvider } from "../src/i18n";

function LibraryShell(props: ComponentProps<typeof LibraryShellComponent>): React.ReactElement {
  return createElement(I18nProvider, null, createElement(LibraryShellComponent, props));
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => window.localStorage.setItem("iterlay:language", "zh-CN"));
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  window.localStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("LibraryShell license entry", () => {
  it("hides the sidebar license shortcut after formal activation", async () => {
    const status: LicenseStatusSnapshot = {
      state: "LICENSED",
      reason: "license_active",
      capabilities: {
        mode: "full",
        canView: true,
        canExport: true,
        canGenerate: true,
        canEdit: true,
        canImport: true,
        canStartTrial: false,
        canActivate: false
      }
    };
    const props = {
      boards: [],
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onOpenReferralInvite: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          LicenseContext.Provider,
          { value: { status, busy: false, openCenter: vi.fn() } },
          createElement(LibraryShell, props)
        )
      );
    });

    expect(container.querySelector('button[aria-label^="授权："]')).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "更多")).toBe(false);
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "设置")).toBe(true);
  });

  it("promotes former more actions and hides the empty more group", async () => {
    const onOpenReferralInvite = vi.fn();
    const props = {
      boards: [],
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onOpenReferralInvite,
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          LicenseContext.Provider,
          { value: { status: null, busy: false, openCenter: vi.fn() } },
          createElement(LibraryShell, props)
        )
      );
    });

    const footer = container.querySelector<HTMLElement>(".library-sidebar-footer");
    const footerButtons = [...(footer?.querySelectorAll<HTMLButtonElement>(":scope > button") ?? [])];
    expect(footerButtons[0]?.textContent?.trim()).toBe("在线分享管理");
    expect(footerButtons[1]?.textContent?.trim()).toBe("回收站");
    expect(footer?.querySelector('button[aria-label^="授权："]')).toBeNull();
    expect(footerButtons.some((button) => button.textContent?.trim() === "更多")).toBe(false);
    expect(container.querySelector("#library-more-actions")).toBeNull();

    const referralButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "邀请好友"
    );
    await act(async () => referralButton?.click());
    expect(onOpenReferralInvite).not.toHaveBeenCalled();
  });

  it("shows trial time in the sidebar and opens the license center", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    const openCenter = vi.fn();
    const status: LicenseStatusSnapshot = {
      state: "TRIAL_ACTIVE",
      reason: "trial_active",
      offlineValidUntil: new Date(Date.now() + 2.5 * 60 * 60 * 1_000).toISOString(),
      capabilities: {
        mode: "full",
        canView: true,
        canExport: true,
        canGenerate: true,
        canEdit: true,
        canImport: true,
        canStartTrial: false,
        canActivate: true
      }
    };
    const props = {
      boards: [],
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          LicenseContext.Provider,
          { value: { status, busy: false, openCenter } },
          createElement(LibraryShell, props)
        )
      );
    });

    const licenseButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.getAttribute("aria-label")?.startsWith("授权：试用 · 2小时")
    );
    const settingsButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "设置"
    );
    const referralButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "邀请好友"
    );
    const updateButton = container.querySelector<HTMLButtonElement>('button[aria-label="检查更新"]');

    expect(licenseButton).toBeUndefined();
    expect(referralButton).toBeUndefined();
    expect(updateButton?.nextElementSibling).toBe(settingsButton);
    expect(openCenter).not.toHaveBeenCalled();
  });

  it("moves update status into the library footer and opens the update center", async () => {
    const openUpdateCenter = vi.fn();
    const state: UpdateStateSnapshot = {
      phase: "available",
      currentVersion: "0.1.7",
      channel: "stable",
      forced: false,
      manifest: {
        version: "0.2.0",
        platform: "darwin",
        downloadUrl: "https://example.com/Iterlay-0.2.0.dmg"
      }
    };
    const props = {
      boards: [],
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          UpdateContext.Provider,
          {
            value: {
              state,
              checking: false,
              hasUpdate: true,
              openUpdateCenter,
              setChannel: vi.fn()
            }
          },
          createElement(
            LicenseContext.Provider,
            { value: { status: null, busy: false, openCenter: vi.fn() } },
            createElement(LibraryShell, props)
          )
        )
      );
    });

    const updateButton = container.querySelector<HTMLButtonElement>('button[aria-label="发现新版本，v0.2.0"]');
    expect(updateButton).not.toBeNull();
    expect(updateButton?.textContent).toContain("发现新版本");
    expect(updateButton?.textContent).toContain("v0.2.0");
    const referralButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "邀请好友"
    );
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "更多")).toBe(false);
    const licenseButton = container.querySelector<HTMLButtonElement>('button[aria-label^="授权："]');
    expect(licenseButton).toBeNull();
    expect(referralButton).toBeUndefined();

    await act(async () => updateButton?.click());
    expect(openUpdateCenter).toHaveBeenCalledOnce();
  });

  it("moves the active indicator between sidebar navigation items", async () => {
    const props = {
      boards: [],
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          LicenseContext.Provider,
          { value: { status: null, busy: false, openCenter: vi.fn() } },
          createElement(LibraryShell, props)
        )
      );
    });

    const nav = container.querySelector<HTMLElement>('nav[aria-label="库导航"]');
    const shell = nav?.closest<HTMLElement>(".library-content");
    const boardsButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "画板库"
    );
    const assetsButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "素材库"
    );

    expect(nav?.className).toContain("flex-col");
    expect(shell?.className).toContain("z-[45]");
    expect(boardsButton?.querySelector("[data-library-nav-indicator]")).not.toBeNull();
    expect(boardsButton?.getAttribute("aria-current")).toBe("page");

    await act(async () => assetsButton?.click());
    expect(boardsButton?.querySelector("[data-library-nav-indicator]")).toBeNull();
    expect(assetsButton?.querySelector("[data-library-nav-indicator]")).not.toBeNull();
    expect(assetsButton?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector("[data-play-asset-entrance]")?.getAttribute("data-play-asset-entrance")).toBe("true");

    await act(async () => assetsButton?.click());
    expect(props.onAssetLibraryEntrancePlayed).not.toHaveBeenCalled();
  });

  it("shows board actions from the recent-board overflow menu", async () => {
    const onDuplicateBoard = vi.fn();
    const props = {
      boards: [{
        id: "board-1",
        name: "产品主视觉",
        createdAt: "2026-07-20T08:00:00.000Z",
        updatedAt: "2026-07-21T08:00:00.000Z",
        imageCount: 6
      }],
      activeBoardId: "board-1",
      openingBoardId: null,
      onOpenBoard: vi.fn(),
      onPrefetchBoard: vi.fn(),
      onCreateBoard: vi.fn(),
      onRenameBoard: vi.fn(),
      onDuplicateBoard,
      onDeleteBoard: vi.fn(async () => undefined),
      onExportBoard: vi.fn(),
      onImportBoard: vi.fn(async () => undefined),
      onImportBoardFiles: vi.fn(async () => undefined),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
      playAssetLibraryEntrance: true,
      onAssetLibraryEntrancePlayed: vi.fn()
    } as unknown as ComponentProps<typeof LibraryShell>;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          LicenseContext.Provider,
          { value: { status: null, busy: false, openCenter: vi.fn() } },
          createElement(LibraryShell, props)
        )
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="画板 产品主视觉 操作"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain("opacity-0");
    expect(trigger?.closest(".group")?.className).toContain("relative");

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });

    const menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
      "重命名",
      "创建副本",
      "导出 .itb",
      "移入回收站"
    ]);

    const duplicateItem = menuItems.find((item) => item.textContent?.trim() === "创建副本");
    await act(async () => duplicateItem?.click());
    expect(onDuplicateBoard).toHaveBeenCalledWith("board-1");
  });
});
