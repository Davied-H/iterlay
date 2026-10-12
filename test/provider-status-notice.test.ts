// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ProviderStatusNotice } from "../src/components/workbench/ProviderStatusNotice.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ProviderStatusNotice", () => {
  it("shows the complete credential error and exposes the recovery action", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onAction = vi.fn();

    await act(async () => {
      root.render(createElement(ProviderStatusNotice, {
        message: "设备凭证已失效，请重新检查授权状态。",
        actionLabel: "检查授权",
        onAction
      }));
    });

    expect(container.querySelector('[aria-label="设备凭证已失效，请重新检查授权状态。"]')).not.toBeNull();
    expect(container.textContent).toContain("设备凭证已失效");
    expect(container.textContent).toContain("请重新检查授权状态");
    const button = container.querySelector("button");
    expect(button?.textContent).toContain("检查授权");
    expect(container.querySelector(".truncate")).toBeNull();

    await act(async () => button?.click());
    expect(onAction).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    container.remove();
  });
});
