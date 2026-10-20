import { useUiText } from "@/i18n";
import { useState } from "react";
import { Images, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { BoardTrashRetentionDays, TrashedBoardSummary } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BoardTrashProps {
  boards: TrashedBoardSummary[];
  retentionDays: BoardTrashRetentionDays;
  loading: boolean;
  onRetentionDaysChange: (days: BoardTrashRetentionDays) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEmpty: () => Promise<void>;
}

const RETENTION_OPTIONS: Array<{ value: BoardTrashRetentionDays; label: string }> = [
  { value: 1, label: "1 天" },
  { value: 3, label: "3 天" },
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
  { value: 0, label: "永不" }
];

export function BoardTrash({
  boards,
  retentionDays,
  loading,
  onRetentionDaysChange,
  onRestore,
  onDelete,
  onEmpty
}: BoardTrashProps): React.ReactElement {
  const uiText = useUiText();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrashedBoardSummary | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [isEmptying, setIsEmptying] = useState(false);

  async function restoreBoard(board: TrashedBoardSummary): Promise<void> {
    if (busyId) return;
    setBusyId(board.id);
    try {
      await onRestore(board.id);
    } catch {
      // 上层已展示错误，保留当前列表供用户重试。
    } finally {
      setBusyId(null);
    }
  }

  async function permanentlyDeleteBoard(): Promise<void> {
    if (!deleteTarget || busyId) return;
    setBusyId(deleteTarget.id);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // 上层已展示错误，保留确认框供用户重试。
    } finally {
      setBusyId(null);
    }
  }

  async function emptyTrash(): Promise<void> {
    if (isEmptying) return;
    setIsEmptying(true);
    try {
      await onEmpty();
      setEmptyConfirmOpen(false);
    } catch {
      // 上层已展示错误，保留确认框供用户重试。
    } finally {
      setIsEmptying(false);
    }
  }

  return (
    <div className="library-content flex h-full min-h-0 flex-col">
      <header className="workbench-page-header flex h-12 shrink-0 items-center gap-3 px-4 [-webkit-app-region:drag]">
        <span className="text-sm font-semibold">{uiText("回收站")}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{boards.length} {uiText("个画板")}</span>
        <div className="ml-auto flex items-center gap-2 [-webkit-app-region:no-drag]">
          <span className="hidden text-xs text-muted-foreground sm:inline">{uiText("自动清理")}</span>
          <Select
            value={String(retentionDays)}
            disabled={loading || isEmptying || busyId !== null}
            onValueChange={(value) => {
              void onRetentionDaysChange(Number(value) as BoardTrashRetentionDays).catch(() => undefined);
            }}
          >
            <SelectTrigger className="h-8 w-24 text-xs" aria-label={uiText("回收站自动清理周期")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {RETENTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{uiText(option.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={boards.length === 0 || loading || isEmptying || busyId !== null}
            onClick={() => setEmptyConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {uiText("清空")}</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-6 sm:px-6">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            <span className="ml-2 text-sm">{uiText("正在读取回收站")}</span>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center border-y border-border text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Trash2 className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">{uiText("回收站是空的")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{uiText("移除的画板会暂时保留在这里。")}</p>
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="hidden grid-cols-[minmax(18rem,1fr)_7rem_9rem_10rem] items-center border-b border-border bg-muted/45 px-3 py-2 text-[11px] font-medium text-muted-foreground min-[980px]:grid">
              <span>{uiText("画板")}</span>
              <span>{uiText("图片")}</span>
              <span>{uiText("移除时间")}</span>
              <span className="text-right">{uiText("操作")}</span>
            </div>
            {boards.map((board) => {
              const isBusy = busyId === board.id;
              return (
                <article
                  key={board.id}
                  className="grid min-h-[84px] grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border px-3 py-2.5 min-[980px]:grid-cols-[minmax(18rem,1fr)_7rem_9rem_10rem]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/70">
                      {board.thumbnailDataUrl ? (
                        <img src={board.thumbnailDataUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                      ) : (
                        <Images className="h-5 w-5 text-muted-foreground/55" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{board.name}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground min-[980px]:hidden">
                        {board.imageCount} {uiText("张图片 · ")}{uiText(formatExpiry(board.expiresAt))}
                      </p>
                    </div>
                  </div>
                  <span className="hidden text-xs tabular-nums text-muted-foreground min-[980px]:block">{board.imageCount}</span>
                  <div className="hidden min-[980px]:block">
                    <p className="text-xs tabular-nums text-muted-foreground">{formatDate(board.deletedAt)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/75">{uiText(formatExpiry(board.expiresAt))}</p>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId !== null || isEmptying}
                      onClick={() => void restoreBoard(board)}
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      {uiText("恢复")}</Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={busyId !== null || isEmptying}
                      title={uiText("彻底删除 {{ui:0}}", [board.name])}
                      aria-label={uiText("彻底删除 {{ui:0}}", [board.name])}
                      onClick={() => setDeleteTarget(board)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !busyId && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{uiText("彻底删除画板")}</DialogTitle>
            <DialogDescription>{uiText("将永久删除「")}{deleteTarget?.name}{uiText("」及其生成历史，删除后无法恢复。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busyId !== null} onClick={() => setDeleteTarget(null)}>{uiText("取消")}</Button>
            <Button variant="destructive" disabled={busyId !== null} onClick={() => void permanentlyDeleteBoard()}>
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {uiText("彻底删除")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emptyConfirmOpen} onOpenChange={(open) => !isEmptying && setEmptyConfirmOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{uiText("清空回收站")}</DialogTitle>
            <DialogDescription>{uiText("将永久删除回收站中的 ")}{boards.length} {uiText("个画板及其生成历史，此操作无法撤销。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isEmptying} onClick={() => setEmptyConfirmOpen(false)}>{uiText("取消")}</Button>
            <Button variant="destructive" disabled={isEmptying} onClick={() => void emptyTrash()}>
              {isEmptying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {uiText("清空回收站")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "-" : new Date(time).toLocaleDateString((document.documentElement.lang || "zh-CN"));
}

function formatExpiry(expiresAt?: string): string {
  if (!expiresAt) return "不会自动清理";
  const diff = Date.parse(expiresAt) - Date.now();
  if (diff <= 0) return "即将清理";
  const days = Math.ceil(diff / (24 * 60 * 60 * 1_000));
  return days <= 1 ? "1 天内清理" : `${days} 天后清理`;
}
