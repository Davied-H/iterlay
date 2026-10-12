import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Film, FolderOpen } from "lucide-react";
import type { BoardVideoSequenceEntryNode } from "@shared/types";

export interface VideoSequenceEntryNodeData {
  node: BoardVideoSequenceEntryNode;
  onOpen?: (sequenceId: string) => void;
}

function VideoSequenceEntryNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const { node, onOpen } = data as unknown as VideoSequenceEntryNodeData;
  return <article
    data-video-sequence-entry=""
    className={`canvas-node-card canvas-workflow-node flex w-[280px] cursor-grab flex-col overflow-hidden ${selected ? "canvas-workflow-node--selected" : ""}`}
    aria-label={`成片序列，${node.name}，${node.segmentCount} 个片段`}
  >
    <header className="canvas-workflow-node__header"><span className="canvas-workflow-node__icon"><Film aria-hidden /></span><span className="canvas-workflow-node__title">成片序列</span></header>
    <div className="flex min-h-24 flex-col justify-center gap-2 px-3 py-3">
      <strong className="line-clamp-2 break-words text-sm">{node.name}</strong>
      <span className="text-xs text-muted-foreground">{node.segmentCount} 个片段 · {formatDuration(node.durationMs)}</span>
      <span className="text-[11px] text-muted-foreground">{node.exportStatus === "completed" ? "已有导出版本" : node.exportStatus === "failed" ? "上次导出失败" : "尚未导出"}</span>
    </div>
    <footer className="nodrag border-t border-border p-2" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground" onClick={() => onOpen?.(node.sequenceId)}><FolderOpen className="h-4 w-4" />打开序列</button>
    </footer>
  </article>;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const VideoSequenceEntryNode = memo(VideoSequenceEntryNodeComponent);
