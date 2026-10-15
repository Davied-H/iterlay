import { translateSourceText } from "@/i18n/ui-text";
import { rebaseBoardSnapshot } from "@shared/board-snapshot-merge";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { toast } from "sonner";
import type {
  BoardConnection,
  BoardData,
  BoardDetail,
  BoardNode,
  BoardSavePayload,
  BoardSummary,
  BoardViewport
} from "@shared/types";
import { BoardSaveCoordinator } from "@/lib/board-save-coordinator";
import { serializeGeneratedImage } from "@/lib/board-node-image";
import type { GeneratedImage } from "@/components/canvas/image-node-model";
import type { CanvasNodeLayout } from "@/components/canvas/canvas-history";
import type { BoardDetailCache } from "@/lib/board-detail-cache";
import type { ImageWorkbenchApi } from "@shared/workbench-client";

interface BoardPersistenceOptions {
  activeBoard: RefObject<{ id: string; name: string } | null>;
  deletedBoardIds: RefObject<Set<string>>;
  images: RefObject<GeneratedImage[]>;
  workflowNodes: RefObject<BoardNode[]>;
  layout: RefObject<{ positions: Record<string, CanvasNodeLayout>; connections: BoardConnection[]; viewport?: BoardViewport }>;
  thumbnail: RefObject<{ key: string; dataUrl: string }>;
  detailCache: RefObject<BoardDetailCache<BoardDetail | null>>;
  getApi: () => ImageWorkbenchApi | null;
  onSummary: (summary: BoardSummary) => void;
  onSaved: (boardId: string) => void;
  onRebased?: (saved: BoardDetail, submitted: BoardSavePayload) => void;
}

async function coverThumbnail(url: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const scale = Math.min(1, 480 / image.naturalWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return resolve("");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch { resolve(""); }
    };
    image.onerror = () => resolve("");
    image.src = url;
  });
}

export function useBoardPersistence(options: BoardPersistenceOptions) {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const observed = useRef(new Map<string, BoardData>());
  const coordinatorRef = useRef<BoardSaveCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new BoardSaveCoordinator(async () => {
      const o = latest.current;
      const board = o.activeBoard.current;
      if (!board || o.deletedBoardIds.current.has(board.id)) return;
      const api = o.getApi();
      if (!api) throw new Error("工作台服务暂不可用，画板尚未保存。");
      const images = o.images.current.filter((image) => !image.pending && image.path);
      const positions = o.layout.current.positions;
      const nodes: BoardNode[] = [
        ...images.map((image) => serializeGeneratedImage(image, positions[image.id] ?? { x: 0, y: 0 })),
        ...o.workflowNodes.current.map((node) => ({
          ...node,
          x: positions[node.id]?.x ?? node.x,
          y: positions[node.id]?.y ?? node.y,
          displayWidth: positions[node.id]?.width ?? node.displayWidth,
          displayHeight: positions[node.id]?.height ?? node.displayHeight
        }))
      ];
      const ids = new Set(nodes.map((node) => node.id));
      const connections = o.layout.current.connections.filter((c) => ids.has(c.source) && ids.has(c.target));
      const viewport = o.layout.current.viewport;
      const cover = images[0];
      const key = cover ? `${cover.path}:${cover.activeVersion ?? -1}` : "";
      const thumbnailDataUrl = key === o.thumbnail.current.key
        ? o.thumbnail.current.dataUrl
        : cover ? await coverThumbnail(cover.dataUrl) : "";
      if (o.activeBoard.current?.id === board.id) o.thumbnail.current = { key, dataUrl: thumbnailDataUrl };
      if (o.deletedBoardIds.current.has(board.id)) return;
      let base = observed.current.get(board.id) ?? await api.getBoard(board.id);
      if (!base) throw new Error("画板不存在，无法保存。");
      let payload: BoardSavePayload = {
        id: board.id, name: board.name, replaceManagedNodes: true, nodes, connections, viewport, thumbnailDataUrl,
        expectedRevision: base.revision ?? 0
      };
      let summary: BoardSummary;
      const submitted = payload;
      let didRebase = false;
      for (let attempt = 0; ; attempt++) {
        try { summary = await api.saveBoard(payload); break; }
        catch (error) {
          if (attempt >= 2 || !(error instanceof Error) || !error.message.includes("BOARD_REVISION_CONFLICT")) throw error;
          const remote = await api.getBoard(board.id);
          if (!remote) throw new Error("画板已删除，无法继续保存。");
          payload = rebaseBoardSnapshot(base, payload, remote);
          base = remote;
          didRebase = true;
        }
      }
      observed.current.set(board.id, { ...base, ...payload, revision: (payload.expectedRevision ?? 0) + 1, nodes: payload.nodes ?? base.nodes });
      if (didRebase && o.activeBoard.current?.id === board.id) {
        const saved = await api.getBoard(board.id);
        if (saved) {
          observed.current.set(board.id, saved);
          o.onRebased?.(saved, submitted);
        }
      }
      o.detailCache.current.delete(board.id);
      o.onSummary(summary);
      o.onSaved(board.id);
    }, (state, error) => {
      if (!mounted.current) return;
      document.documentElement.dataset.boardSaveState = state;
      if (state === "saved") toast.dismiss("board-save-error");
      if (state === "failed") toast.error(translateSourceText("画板尚未保存"), {
        id: "board-save-error", duration: Infinity,
        description: error instanceof Error ? error.message : translateSourceText("请检查磁盘空间或目录权限。"),
        action: { label: "重试保存", onClick: () => { void coordinatorRef.current?.flush().catch(() => undefined); } }
      });
    });
  }
  const coordinator = coordinatorRef.current;
  const persistBoard = useCallback(() => coordinator.saveNow(), [coordinator]);
  const scheduleBoardSave = useCallback(() => {
    if (latest.current.activeBoard.current) coordinator.schedule();
  }, [coordinator]);
  const flushBoardSave = useCallback(() => coordinator.flush(), [coordinator]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // HMR/error recovery can unmount without a native close request.
      void coordinator.flush().catch((error) => console.warn("卸载前画板保存失败", error));
    };
  }, [coordinator]);
  const observeBoard = useCallback((board: BoardData) => {
    observed.current.delete(board.id);
    observed.current.set(board.id, board);
    while (observed.current.size > 8) {
      const oldest = observed.current.keys().next().value;
      if (oldest === undefined) break;
      observed.current.delete(oldest);
    }
  }, []);
  return { boardSaveCoordinator: coordinator, persistBoard, scheduleBoardSave, flushBoardSave, observeBoard };
}
