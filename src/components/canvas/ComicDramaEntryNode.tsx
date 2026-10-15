import { useUiText } from "@/i18n";
import { memo, useEffect, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { ArrowRight, Clapperboard, Clock3, FolderOpen, Trash2 } from "lucide-react";
import type { BoardComicDramaEntryNode, BoardEnterOrigin, BoardSummary } from "@shared/types";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import "./ComicDramaEntryNode.css";

export interface ComicDramaEntryNodeData {
  node: BoardComicDramaEntryNode;
  onOpen?: (node: BoardComicDramaEntryNode, origin?: BoardEnterOrigin) => void;
  onDelete?: (nodeId: string) => void;
}

function formatRelativeUpdate(updatedAt?: string): string {
  if (!updatedAt) return "独立制作画板";
  const elapsed = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "最近更新";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前更新`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} 天前更新` : "最近更新";
}

function ComicDramaEntryNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const uiText = useUiText();

  const { node, onOpen, onDelete } = data as unknown as ComicDramaEntryNodeData;
  const [summary, setSummary] = useState<BoardSummary>();
  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    let active = true;
    void getImageWorkbenchApi().listBoards().then((boards) => {
      if (active) setSummary(boards.find((board) => board.id === node.childBoardId));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [node.childBoardId]);
  const imageCount = summary?.imageCount ?? 0;
  const hasCover = Boolean(summary?.thumbnailDataUrl);
  const openProject = (element: HTMLElement): void => {
    const card = element.closest<HTMLElement>("[data-comic-drama-entry]");
    const rect = card?.getBoundingClientRect();
    onOpen?.(node, rect ? {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      thumbnailDataUrl: summary?.thumbnailDataUrl ?? "comic-drama:"
    } : undefined);
  };
  return (
    <article
      data-comic-drama-entry=""
      className={cn(
        "canvas-node-card canvas-workflow-node comic-drama-entry-node relative flex w-[420px] cursor-grab flex-col overflow-hidden",
        !hasCover && "comic-drama-entry-node--empty",
        selected && "canvas-workflow-node--selected"
      )}
      aria-label={uiText("漫剧项目，{{ui:0}}", [node.name])}
    >
      {hasCover ? (
        <img
          className="comic-drama-entry-node__cover"
          src={summary?.thumbnailDataUrl}
          alt=""
          draggable={false}
        />
      ) : (
        <div className="comic-drama-entry-node__placeholder" aria-hidden>
          <span /><span /><span />
        </div>
      )}
      <div className="comic-drama-entry-node__shade" aria-hidden />
      <header className="comic-drama-entry-node__header">
        <div className="comic-drama-entry-node__project">
          <span className="comic-drama-entry-node__icon"><Clapperboard aria-hidden /></span>
          <span>{uiText("漫剧项目")}</span>
        </div>
        <div className="nodrag comic-drama-entry-node__header-actions" onPointerDown={(event) => event.stopPropagation()}>
          <span className="comic-drama-entry-node__status"><i />{imageCount > 0 ? uiText("制作中") : uiText("待开始")}</span>
          <button
            type="button"
            className="comic-drama-entry-node__delete"
            aria-label={uiText("删除漫剧项目")}
            title={uiText("删除漫剧项目")}
            onClick={() => onDelete?.(node.id)}
          >
            <Trash2 aria-hidden />
          </button>
        </div>
      </header>
      <section className="comic-drama-entry-node__body">
        <span>{imageCount > 0 ? uiText("{{ui:0}} 张素材", [imageCount]) : uiText("独立制作画板")}</span>
        <h2>{node.name}</h2>
        <p>{uiText("设定、角色、片段、图片与视频都在子画板中管理。")}</p>
      </section>
      <footer className="nodrag comic-drama-entry-node__footer" onPointerDown={(event) => event.stopPropagation()}>
        <span className="comic-drama-entry-node__updated"><Clock3 aria-hidden />{formatRelativeUpdate(summary?.updatedAt)}</span>
        <button type="button" className="canvas-generation-run" onClick={(event) => openProject(event.currentTarget)}>
          <FolderOpen aria-hidden />{uiText("打开漫剧画板")}<ArrowRight aria-hidden />
        </button>
      </footer>
    </article>
  );
}

export const ComicDramaEntryNode = memo(ComicDramaEntryNodeComponent);
