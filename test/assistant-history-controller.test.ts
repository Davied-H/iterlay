// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssistantHistory } from "../src/features/assistant/use-assistant-history";
import { useAssistantSessionState } from "../src/features/assistant/use-assistant-session-state";
import type { AssistantHistoryConversation } from "../src/lib/assistant-history";
import type { AssistantConversationRecord } from "../shared/types";

const { list, errorToast } = vi.hoisted(() => ({ list: vi.fn(), errorToast: vi.fn() }));
vi.mock("../src/lib/image-workbench-api", () => ({ getImageWorkbenchApi: () => ({ listAssistantConversations: list }), getWorkbenchErrorMessage: (_: unknown, fallback: string) => fallback }));
vi.mock("sonner", () => ({ toast: { error: errorToast } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.clearAllMocks());

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function record(id: string): AssistantConversationRecord {
  return { id, conversationId: id, occurredAt: "2026-10-20T00:00:00Z", instruction: id, response: "回复", surface: "canvas-prompt" } as AssistantConversationRecord;
}
function conversation(boardId = "one"): AssistantHistoryConversation {
  return { id: "saved", boardId, title: "历史", preview: "回复", updatedAt: "", exchangeCount: 1, messages: [{ id: "reply", role: "assistant", content: "回复", generatedPrompt: "保留历史提示词" }] };
}
async function setup() {
  let history!: ReturnType<typeof useAssistantHistory>;
  let session!: ReturnType<typeof useAssistantSessionState>;
  const navigate = vi.fn();
  const root = createRoot(document.createElement("div"));
  function Harness({ boardId }: { boardId: string }) {
    session = useAssistantSessionState();
    history = useAssistantHistory({ session, boardId, assistantSurface: "canvas-prompt", onOpenAssistantConversation: navigate });
    return null;
  }
  const render = async (boardId: string) => { await act(async () => root.render(createElement(Harness, { boardId }))); };
  await render("one");
  return { history: () => history, session: () => session, navigate, render, unmount: async () => { await act(async () => root.unmount()); } };
}

describe("assistant history controller", () => {
  it("keeps the newest scope result when earlier requests finish out of order", async () => {
    const first = deferred<AssistantConversationRecord[]>(), second = deferred<AssistantConversationRecord[]>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const harness = await setup();
    try {
      await act(async () => { void harness.history().loadAssistantHistory("board"); });
      await act(async () => harness.history().changeAssistantHistoryScope("all"));
      expect(list.mock.calls.map(([query]) => query)).toEqual([{ boardId: "one", surface: "canvas-prompt" }, { surface: "canvas-prompt" }]);
      await act(async () => second.resolve([record("newest")]));
      await act(async () => first.resolve([record("stale")]));
      expect(harness.history().assistantHistory.map(({ id }) => id)).toEqual(["newest"]);
      expect(harness.history().assistantHistoryLoading).toBe(false);
    } finally { await harness.unmount(); }
  });

  it("invalidates old results on board changes and ignores errors after unmount", async () => {
    const first = deferred<AssistantConversationRecord[]>(), second = deferred<AssistantConversationRecord[]>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const harness = await setup();
    await act(async () => { void harness.history().loadAssistantHistory(); });
    await harness.render("two");
    await act(async () => first.resolve([record("wrong-board")]));
    expect(harness.history().assistantHistory).toEqual([]);
    await act(async () => { void harness.history().loadAssistantHistory(); });
    await harness.unmount();
    await act(async () => second.reject(new Error("offline")));
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("navigates across boards and restores local history by stopping the previous stream", async () => {
    const harness = await setup();
    try {
      await act(async () => harness.history().selectAssistantHistory(conversation("two")));
      expect(harness.navigate).toHaveBeenCalledWith("saved", "two");
      const dispose = vi.fn();
      harness.session().assistantStreamRef.current = { dispose, cancel: vi.fn(), respondToInteraction: vi.fn() };
      harness.session().assistantClarificationRoundsRef.current = 3;
      const version = harness.session().assistantRequestVersionRef.current;
      await act(async () => harness.history().selectAssistantHistory(conversation()));
      expect(dispose).toHaveBeenCalledOnce();
      expect(harness.session().assistantRequestVersionRef.current).toBe(version + 1);
      expect(harness.session().assistantStreamRef.current).toBeNull();
      expect(harness.session().assistantClarificationRoundsRef.current).toBe(0);
      expect(harness.session().assistantConversationId).toBe("saved");
      expect(harness.session().assistantMessages[0].generatedPrompt).toBe("保留历史提示词");
      expect(harness.session().assistantActivity).toBeNull();
      expect(harness.session().assistantStreaming).toBe(false);
    } finally { await harness.unmount(); }
  });
});
