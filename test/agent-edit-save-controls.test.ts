// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdvancedImageEditor } from "../src/components/canvas/AdvancedImageEditor";
import type { AgentEditDraft } from "../shared/modification-requests";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function button(label: string): HTMLButtonElement {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  if (!node) throw new Error(`Missing control: ${label}`);
  return node;
}

describe("saving masked agent edit requests", () => {
  it("pins the mask to the displayed version and retains the draft after failure without running generation", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const context = {
      clearRect: vi.fn(), fillRect: vi.fn(), putImageData: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
      createImageData: () => ({ data: new Uint8ClampedArray(4) })
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,MASK");
    let rejectSave!: (reason: Error) => void;
    const save = vi.fn<(draft: AgentEditDraft) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }))
      .mockResolvedValueOnce(undefined);
    const apply = vi.fn();
    const back = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(AdvancedImageEditor, {
        image: {
          id: "image-one", path: "/v2.png", dataUrl: "data:image/png;base64,V2", jobId: "job-v2", activeVersion: 1,
          versions: [
            { path: "/v1.png", dataUrl: "data:image/png;base64,V1", jobId: "job-v1", width: 100, height: 100 },
            { path: "/v2.png", dataUrl: "data:image/png;base64,V2", jobId: "job-v2", width: 100, height: 100 }
          ], width: 100, height: 100
        },
        initialPrompt: "", providerName: "Offline fixture", canDetectSubject: true, canInterpretBoard: false,
        onDetectSubject: async () => ({ x: 0, y: 0, width: 30, height: 30 }),
        onSwitchVersion: vi.fn(), onPasteCanvasReferences: async () => [], onPasteReferences: async () => [],
        onApply: apply, onInterpretRelaxFlow: vi.fn(), onRefineRelaxFlow: vi.fn(), onGenerateRelaxFlow: vi.fn(),
        onSaveAgentRequest: save, onBack: back, onClose: vi.fn()
      })));
      expect(button("保存给 Agent").disabled).toBe(true);
      await act(async () => button("识别主体区域").click());
      await act(async () => button("保存给 Agent").click());
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ sourceVersionIndex: 1, instruction: "", maskDataUrl: "data:image/png;base64,MASK", regions: [] }));
      expect(button("正在保存修改请求…").disabled).toBe(true);
      expect(button("返回普通编辑").disabled).toBe(true);
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
      expect(back).not.toHaveBeenCalled();
      await act(async () => rejectSave(new Error("Disk full")));
      expect(document.body.textContent).toContain("Disk full");
      expect(button("保存给 Agent").disabled).toBe(false);
      await act(async () => button("保存给 Agent").click());
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
      expect(apply).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount()); host.remove();
    }
  });
});
