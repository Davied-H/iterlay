import { useEffect, useState } from "react";
import type { ComicDramaBoardSnapshot } from "@shared/types";
import { SHORT_DRAMA_PLUGIN_ID } from "@shared/plugins";
import type { ComicDramaAssistantGuide } from "@/lib/comic-drama-assistant";
import { requestPluginCapability } from "@/features/plugins/request-plugin-capability";

/** Only the installed plugin supplies comic-specific context and stage guidance. */
export function useComicAssistantContext(
  enabled: boolean,
  snapshot: ComicDramaBoardSnapshot | null | undefined,
  selectedNodeIds: string[]
): { guide: ComicDramaAssistantGuide | null; context: string } {
  const selectedNodeIdsKey = JSON.stringify(selectedNodeIds);
  const [result, setResult] = useState<{ guide: ComicDramaAssistantGuide | null; context: string }>({ guide: null, context: "" });
  useEffect(() => {
    setResult((current) => current.guide === null && current.context === ""
      ? current
      : { guide: null, context: "" });
    if (!enabled || !snapshot) return;
    const controller = new AbortController();
    const input = { snapshot, selectedNodeIds: JSON.parse(selectedNodeIdsKey) as string[] };
    void Promise.all([
      requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "comic.guide", input, { signal: controller.signal }),
      requestPluginCapability(SHORT_DRAMA_PLUGIN_ID, "comic.context", input, { signal: controller.signal })
    ]).then(([guide, context]) => {
      if (!controller.signal.aborted) setResult({ guide, context });
    }).catch(() => {
      // The workspace can still render. Planning reports the actionable install/update error.
    });
    return () => controller.abort();
  }, [enabled, snapshot, selectedNodeIdsKey]);
  return result;
}
