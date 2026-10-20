import type { comicDramaAssistantGuide, createComicDramaMutationPlan, createComicCharactersMutationPlan } from "@/lib/comic-drama-assistant";
import type { BoardMutationPlan, ComicDramaBoardSnapshot } from "@shared/comic-drama";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { validateImageRecipe, type PluginImageRecipe } from "./validate-image-recipe";

interface CapabilityOptions {
  signal?: AbortSignal;
  isCurrentBoard?: () => boolean;
}

/** Run policy from the installed package, never import plugin source into the host bundle. */
interface CapabilityInputs {
  "character.prepareGeneration": unknown;
  "project.initialize": { snapshot: ComicDramaBoardSnapshot; instruction: string };
  "comic.plan": Parameters<typeof createComicDramaMutationPlan>[0];
  "comic.charactersPlan": Parameters<typeof createComicCharactersMutationPlan>[0];
  "comic.guide": { snapshot: ComicDramaBoardSnapshot; selectedNodeIds: readonly string[] };
  "comic.context": { snapshot: ComicDramaBoardSnapshot; selectedNodeIds: readonly string[] };
}
interface CapabilityResults {
  "character.prepareGeneration": PluginImageRecipe;
  "project.initialize": BoardMutationPlan;
  "comic.plan": BoardMutationPlan;
  "comic.charactersPlan": BoardMutationPlan;
  "comic.guide": ReturnType<typeof comicDramaAssistantGuide>;
  "comic.context": string;
}
export async function requestPluginCapability<T extends keyof CapabilityInputs>(
  pluginId: string, capability: T, input: CapabilityInputs[T],
  { signal, isCurrentBoard = () => true }: CapabilityOptions = {}
): Promise<CapabilityResults[T]> {
  if (!["character.prepareGeneration", "project.initialize", "comic.plan", "comic.charactersPlan", "comic.guide", "comic.context"].includes(capability)) throw new Error("未知的插件能力。");
  const assertCurrent = (): void => {
    if (signal?.aborted || !isCurrentBoard()) throw new Error("画板已切换或请求已取消，请重新生成。");
  };
  assertCurrent();
  const api = getImageWorkbenchApi();
  await api.authorizePlugin(pluginId, "assistant:comic-drama");
  const installed = (await api.listPlugins()).find(plugin => plugin.manifest.id === pluginId && plugin.enabled);
  if (!installed) throw new Error("请在插件市场安装或启用短剧助手，画板内容已保留。");
  if (pluginId === "dev.iterlay.short-drama" && comparePluginVersions(installed.manifest.version, "1.3.2") < 0) {
    throw new Error("请在插件市场将短剧助手更新至 1.3.2 或更新版本后重试，已有项目与素材会保留。");
  }
  const url = await api.getPluginFrameUrl(pluginId);
  assertCurrent();
  return new Promise<CapabilityResults[T]>((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.referrerPolicy = "no-referrer";
    const requestId = crypto.randomUUID();
    let settled = false;
    const finish = (error?: Error, result?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal?.removeEventListener("abort", abort);
      frame.remove();
      if (error) reject(error); else resolve(result as CapabilityResults[T]);
    };
    const abort = (): void => finish(new Error("插件请求已取消。"));
    const receive = async (event: MessageEvent): Promise<void> => {
      if (event.source !== frame.contentWindow || event.data?.source !== "iterlay-plugin"
        || event.data.type !== "capability-result" || event.data.id !== requestId) return;
      try {
        await api.authorizePlugin(pluginId, "assistant:comic-drama");
        if (settled) return;
        assertCurrent();
        if (event.data.error) throw new Error(String(event.data.error));
        if (capability === "character.prepareGeneration") finish(undefined, validateImageRecipe(event.data.result));
        else if (capability === "comic.context") {
          if (typeof event.data.result !== "string" || event.data.result.length > 100_000) throw new Error("插件上下文无效。");
          finish(undefined, event.data.result);
        } else if (capability === "comic.guide") {
          const result = event.data.result;
          if (!result || typeof result.stage !== "string" || typeof result.message !== "string" || typeof result.placeholder !== "string"
            || !Array.isArray(result.suggestions) || result.suggestions.some((value: unknown) => typeof value !== "string")
            || JSON.stringify(result).length > 100_000) throw new Error("插件引导无效。");
          finish(undefined, result);
        } else {
          const result = event.data.result as BoardMutationPlan;
          const source = input as { snapshot: ComicDramaBoardSnapshot };
          if (!result || result.boardId !== source.snapshot.boardId || result.baseRevision !== source.snapshot.revision
            || !Array.isArray(result.additions?.nodes) || result.additions.nodes.length > 1000
            || JSON.stringify(result).length > 2_000_000) throw new Error("插件返回的项目计划无效。");
          finish(undefined, result);
        }
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    const timer = setTimeout(() => finish(new Error("已安装插件未提供此能力，请在插件市场更新后重试。")), 10_000);
    window.addEventListener("message", receive);
    signal?.addEventListener("abort", abort, { once: true });
    frame.onload = () => {
      try {
        assertCurrent();
        frame.contentWindow?.postMessage({ source: "iterlay-host", type: "capability", id: requestId, capability, input }, "*");
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    frame.onerror = () => finish(new Error("插件加载失败，请重新安装后重试。"));
    frame.src = `${url}#capability`;
    document.body.append(frame);
  });
}

export function comparePluginVersions(left: string, right: string): number {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
