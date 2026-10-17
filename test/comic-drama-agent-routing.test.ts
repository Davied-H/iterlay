import { readUiSource as readFileSync } from "./helpers/ui-source";
import { describe, expect, it } from "vitest";

const promptDock = readFileSync(new URL("../src/components/workbench/PromptDock.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/comic-drama/ComicDramaWorkspace.tsx", import.meta.url), "utf8");
const host = readFileSync(new URL("../src/components/plugins/PluginFrame.tsx", import.meta.url), "utf8");
const tool = readFileSync(new URL("../plugins/short-drama/src/main.tsx", import.meta.url), "utf8");
const ipc = readFileSync(new URL("../electron/ipc.ts", import.meta.url), "utf8");

describe("comic drama Agent routing", () => {
  it("uses the internal Agent stream instead of the local planner in the dedicated workspace", () => {
    expect(promptDock).toContain('agentMode: assistantSurface === "comic-drama"');
    expect(host).toContain("startSceneCollaborationStream({");
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
    expect(host).toContain("startSceneCollaborationStream({");
    expect(host).toContain('assistantSurface: "comic-drama"');
    expect(host).toContain("agentMode: true");
    expect(host).toContain("respondToInteraction");
    expect(tool).toContain("iterlay.assistant.cancel()");
    expect(tool).toContain("setConversationId(crypto.randomUUID())");
    expect(workspace).toContain("<PluginTools workspace");
    expect(workspace).not.toContain("createComicDramaMutationPlan");
  });
});
