// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n";
import { AssistantQuestionnaire } from "../src/components/assistant/questions/AssistantQuestionnaire";
import { assistantInteractionSupplementKey } from "../src/lib/assistant-interaction";
import type { SceneAssistantInteraction } from "../shared/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
type Form = Extract<SceneAssistantInteraction, { type: "form" }>;
let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.();
});

async function render(fields: Form["fields"], extras = {}) {
  localStorage.setItem("iterlay:language", "zh-CN");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    onSubmit = vi.fn(),
    onDismiss = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(AssistantQuestionnaire, {
          interaction: { type: "form", title: "创作需求", fields },
          disabled: false,
          onSubmit,
          onDismiss,
          ...extras,
        }),
      ),
    ),
  );
  dispose = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent?.trim() === label,
    )!;
  const click = async (label: string) => act(async () => button(label).click());
  const fill = async (label: string, value: string) => {
    const node = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`input[aria-label="${label}"],textarea[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        node instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  return { container, onSubmit, onDismiss, button, click, fill };
}
const options = [
  { label: "自然", value: "natural" },
  { label: "戏剧", value: "dramatic" },
];

describe("assistant questionnaire", () => {
  it("keeps single, multiple and text answers across back/next and submits only on the last question", async () => {
    const page = await render([
      { id: "style", label: "风格", type: "select", required: true, options },
      {
        id: "channels",
        label: "渠道",
        type: "select",
        multiple: true,
        required: true,
        options,
      },
      { id: "title", label: "标题", type: "text", required: true },
      { id: "notes", label: "备注", type: "textarea" },
    ]);
    expect(page.button("下一题").disabled).toBe(true);
    await act(async () =>
      page.container
        .querySelector<HTMLInputElement>('input[value="natural"]')!
        .click(),
    );
    await page.fill("补充说明：风格", "保留纸张质感");
    await page.click("下一题");
    expect(document.activeElement).toBe(
      page.container.querySelector(".ct-question-current"),
    );
    expect(page.container.querySelectorAll('input[type="radio"]')).toHaveLength(
      0,
    );
    for (const value of ["natural", "dramatic"])
      await act(async () =>
        page.container
          .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
          .click(),
      );
    await page.click("上一题");
    expect(
      page.container.querySelector<HTMLInputElement>('input[value="natural"]')!
        .checked,
    ).toBe(true);
    expect(
      page.container.querySelector<HTMLTextAreaElement>("textarea")!.value,
    ).toBe("保留纸张质感");
    await page.click("下一题");
    expect(page.container.querySelectorAll("input:checked")).toHaveLength(2);
    await page.click("下一题");
    await page.fill("标题", "晨间咖啡");
    // Enter on a short answer follows the same next-question path.
    await act(async () =>
      page.container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(page.onSubmit).not.toHaveBeenCalled();
    expect(page.container.textContent).toContain("问题 4 / 4");
    await page.click("提交回答");
    expect(page.onSubmit).toHaveBeenCalledOnce();
    expect(page.onSubmit).toHaveBeenCalledWith({
      style: "natural",
      channels: ["natural", "dramatic"],
      title: "晨间咖啡",
      [assistantInteractionSupplementKey("style")]: "保留纸张质感",
    });
  });

  it("accepts custom text without forcing a listed choice and enforces disabled supplements", async () => {
    const page = await render([
      { id: "style", label: "风格", type: "select", required: true, options },
      {
        id: "channel",
        label: "渠道",
        type: "select",
        required: true,
        allowSupplement: false,
        options,
      },
    ]);
    await page.fill("补充说明：风格", "我希望用水彩风格");
    await page.click("下一题");
    expect(page.container.querySelector("textarea")).toBeNull();
    expect(page.button("提交回答").disabled).toBe(true);
    await act(async () =>
      page.container
        .querySelector<HTMLInputElement>('input[value="dramatic"]')!
        .click(),
    );
    await page.click("提交回答");
    expect(page.onSubmit).toHaveBeenCalledWith({
      [assistantInteractionSupplementKey("style")]: "我希望用水彩风格",
      channel: "dramatic",
    });
  });

  it("blocks blank required text and keeps dismiss separate from submit", async () => {
    const page = await render([
      { id: "title", label: "标题", type: "text", required: true },
    ]);
    await page.fill("标题", "   ");
    expect(page.button("继续").disabled).toBe(true);
    await page.click("用文字回答");
    expect(page.onDismiss).toHaveBeenCalledOnce();
    expect(page.onSubmit).not.toHaveBeenCalled();
  });

  it("disables every input and navigation while the host is busy", async () => {
    const page = await render(
      [{ id: "style", label: "风格", type: "select", options }],
      { disabled: true },
    );
    expect(
      [
        ...page.container.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
        >("input,textarea,button"),
      ].every((node) => node.disabled),
    ).toBe(true);
    expect(page.onSubmit).not.toHaveBeenCalled();
  });
});
