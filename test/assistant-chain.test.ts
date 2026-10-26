// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { AssistantProcessDetails } from "../src/components/assistant/AssistantMessageDetails";
import { I18nProvider } from "../src/i18n";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("combines activity and tools, preserves user expansion and exposes failures and payloads", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (streaming: boolean) => {
    await act(async () => root.render(createElement(I18nProvider, null, createElement(AssistantProcessDetails, { streaming, activitySteps: ["准备生成", "准备生成"], calls: [{ id: "tool", name: "generate_image", status: streaming ? "running" : "error", input: "prompt", output: streaming ? undefined : "provider unavailable" }] }))));
  };
  try {
    await render(true);
    expect(container.querySelectorAll("[data-assistant-process]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-step-status]")).toHaveLength(0);
    const header = container.querySelector("button")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    await render(false);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(header.textContent).toContain("部分失败");
    await act(async () => header.click());
    const details = container.querySelector("details")!;
    await act(async () => { details.open = true; });
    expect(details.textContent).toContain("prompt");
    expect(details.textContent).toContain("provider unavailable");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("uses one collapsed status and reveals a complete useful trace on demand", async () => {
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(I18nProvider, null, createElement(AssistantProcessDetails, {
      streaming: true, activitySteps: ["正在读取画板...", "正在连接模型...", "正在分析需求...", "正在生成图片..."], reasoningSummary: "选择清晰构图。"
    }))));
    expect(container.querySelectorAll(".assistant-process-activity")).toHaveLength(0);
    expect(container.textContent).not.toContain("查看全部步骤");
    const header = container.querySelector<HTMLButtonElement>(".assistant-chain-trigger")!;
    expect(header.textContent).toContain("正在思考");
    await act(async () => header.click());
    expect(container.querySelectorAll(".assistant-process-activity")).toHaveLength(2);
    expect(container.textContent).toContain("思考过程");
    expect(container.textContent).not.toContain("连接模型");
    expect(container.textContent).not.toContain("分析需求");
    expect(container.querySelector(".assistant-chain-content")).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});
