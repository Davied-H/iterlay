// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsRow } from "../src/components/workbench/settings/SettingsPrimitives";
import { ChoiceGrid } from "../src/components/workbench/settings/provider-settings-components";
import { Switch } from "../src/components/ui/switch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const disposers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); });
async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  disposers.push(async () => { await act(async () => root.unmount()); host.remove(); });
  return host;
}

describe("shared settings controls", () => {
  it("keeps the whole labeled setting row usable as a switch target", async () => {
    const change = vi.fn();
    const host = await mount(createElement(SettingsRow, {
      title: "显示创作助手", description: "显示入口与快捷键", interactive: true,
      control: createElement(Switch, { checked: false, onCheckedChange: change })
    }));
    await act(async () => host.querySelector<HTMLSpanElement>(".settings-row-description")!.click());
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith(true);
  });

  it("moves selection and focus together when using arrow keys in a radio group", async () => {
    function Fixture() {
      const [value, setValue] = useState("balanced");
      return createElement(ChoiceGrid, { value, onChange: setValue, ariaLabel: "使用程度", columns: 3,
        options: [{ value: "cautious", title: "谨慎" }, { value: "balanced", title: "平衡" }, { value: "active", title: "积极" }] });
    }
    const host = await mount(createElement(Fixture));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[1].focus();
    await act(async () => radios[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[1].tabIndex).toBe(-1);
    await act(async () => radios[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[0]);
  });

  it("keeps disabled options inactive when their parent setting is unavailable", async () => {
    const change = vi.fn();
    const host = await mount(createElement(ChoiceGrid, { value: "png", onChange: change, ariaLabel: "复制格式", disabled: true,
      options: [{ value: "png", title: "PNG" }, { value: "gif", title: "GIF" }] }));
    await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1].click());
    expect(change).not.toHaveBeenCalled();
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute("aria-disabled")).toBe("true");
  });
});
