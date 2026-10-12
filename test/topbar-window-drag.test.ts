import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const topBarSource = readFileSync(
  new URL("../src/components/workbench/TopBar.tsx", import.meta.url),
  "utf8"
);

describe("workspace top bar window drag regions", () => {
  it("keeps controls outside the Electron drag region", () => {
    const headerClass = topBarSource.match(
      /data-workspace-topbar=""\s+className="([^"]+)"/
    )?.[1];
    const dragRegionClass = topBarSource.match(
      /data-window-drag-region=""[\s\S]*?className="([^"]+)"/
    )?.[1];

    expect(headerClass).toBeDefined();
    expect(headerClass).not.toContain("app-region:drag");
    expect(dragRegionClass).toContain("[-webkit-app-region:drag]");
    expect(topBarSource).toContain(
      'className="flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]'
    );
  });
});
