import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const promptDockSource = readFileSync(
  new URL("../src/components/workbench/PromptDock.tsx", import.meta.url),
  "utf8"
);

describe("prompt dock canvas safe area", () => {
  it("keeps the canvas full-height while the prompt dock floats over it", () => {
    expect(appSource).toContain('data-canvas-visible-area=""');
    expect(appSource).toContain('className="absolute inset-y-0 left-0 max-[700px]:!right-0"');
    expect(appSource).not.toContain("promptDockVisibleHeight");
    expect(promptDockSource).toContain(
      '"prompt-dock-layer pointer-events-none absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2"'
    );
    expect(promptDockSource).toContain('rightRailOpen ? "pr-[352px]" : "pr-4"');
    expect(promptDockSource).toContain('data-edit-dock=""');
    expect(promptDockSource).toContain('isExpanded ? "max-w-2xl" : "max-w-lg"');
    expect(promptDockSource).not.toContain("onVisibleHeightChange");
  });

  it("guards passive preload calls when rendered in a browser-only Vite session", () => {
    expect(promptDockSource).toContain("if (!draft || !hasImageWorkbenchApi()) return;");
    expect(promptDockSource).toContain("if (!memoryEnabled || editTarget?.path || !hasImageWorkbenchApi())");
    expect(promptDockSource).toContain("if (!shouldRestoreBoardConversation || !hasImageWorkbenchApi())");
  });
});
