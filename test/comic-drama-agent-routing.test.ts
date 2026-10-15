import { readUiSource as readFileSync } from "./helpers/ui-source";
import { describe, expect, it } from "vitest";

const promptDock = readFileSync(new URL("../src/components/workbench/PromptDock.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/comic-drama/ComicDramaWorkspace.tsx", import.meta.url), "utf8");
const ipc = readFileSync(new URL("../electron/ipc.ts", import.meta.url), "utf8");

describe("comic drama Agent routing", () => {
  it("uses the internal Agent stream instead of the local planner in the dedicated workspace", () => {
    expect(promptDock).toContain('agentMode: assistantSurface === "comic-drama"');
    expect(workspace).toContain("startSceneCollaborationStream(request");
    expect(workspace).not.toContain("attachAgentPlan");
    expect(workspace).not.toContain("comicDramaPlan");
    expect(workspace).not.toContain("createComicDramaMutationPlan");
  });

  it("forces Agent mode and supplies the internal comic tool runtime", () => {
    expect(ipc).toContain('request.agentMode !== true');
    expect(ipc).toContain('request.assistantSurface === "comic-drama"');
    expect(ipc).toContain("createComicDramaAgentTools");
    expect(ipc).toContain("piAgentBuiltinTools: []");
    expect(ipc).toContain("piAgentExtensionPaths: []");
  });

  it("runs the dedicated comic workspace as a standard streaming Pi Agent assistant", () => {
    expect(workspace).toContain("startSceneCollaborationStream(request");
    expect(workspace).toContain('assistantSurface: "comic-drama"');
    expect(workspace).toContain("agentMode: true");
    expect(workspace).toContain('title="AI 助手"');
    expect(workspace).toContain("streaming={streaming}");
    expect(workspace).toContain("onStop={stop}");
    expect(workspace).toContain("onNewConversation={startNewConversation}");
    expect(workspace).toContain('resolveAssistantInteraction(result, "comic-drama")');
    expect(workspace).toContain("formatAssistantInteractionAnswers(interaction.interaction, values)");
    expect(workspace).not.toContain("const plan = createComicDramaMutationPlan({\n        snapshot: currentSnapshot");
  });
});
