import type { BoardMutationPlan, BoardMutationResult, ComicDramaBoardSnapshot } from "@shared/types";
import { PluginTools } from "@/components/plugins/PluginTools";
import { useI18n } from "@/i18n";
import "./ComicDramaWorkspace.css";

interface ComicDramaWorkspaceProps {
  snapshot: ComicDramaBoardSnapshot;
  selectedNodeIds: readonly string[];
  onBack: () => void;
  onBeforeAgentRequest: () => Promise<void>;
  onAgentMutation: (result: BoardMutationResult) => Promise<void>;
  onApplyPlan: (plan: BoardMutationPlan) => Promise<void>;
  onSelect: (ids: string[]) => void;
}
/** The workspace owns layout only; all production UI is loaded from an installed plugin. */
export function ComicDramaWorkspace({ snapshot, selectedNodeIds, onBack, onBeforeAgentRequest, onAgentMutation, onApplyPlan, onSelect }: ComicDramaWorkspaceProps) {
  const { locale } = useI18n();
  return <main className="comic-drama-workspace" aria-label="短剧制作工作台">
    <PluginTools workspace onBack={onBack} context={{ boardId: snapshot.boardId, selectedNodeIds: [...selectedNodeIds], locale, theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }} beforeRequest={onBeforeAgentRequest} onMutation={onAgentMutation} onApplyPlan={onApplyPlan} onSelect={onSelect} />
  </main>;
}
