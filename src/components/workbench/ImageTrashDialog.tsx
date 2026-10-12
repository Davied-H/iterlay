import { useCallback, useEffect, useState } from "react";
import { ImageOff, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  BoardTrashRetentionDays,
  RestoreTrashedBoardImageResult,
  TrashedBoardImage
} from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

interface ImageTrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (result: RestoreTrashedBoardImageResult) => Promise<void>;
}

const retentionOptions: Array<{ value: BoardTrashRetentionDays; label: string }> = [
  { value: 1, label: "1 天" },
  { value: 3, label: "3 天" },
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
  { value: 0, label: "永不" }
];

export function ImageTrashDialog({ open, onOpenChange, onRestore }: ImageTrashDialogProps): React.ReactElement {
  const [items, setItems] = useState<TrashedBoardImage[]>([]);
  const [retentionDays, setRetentionDays] = useState<BoardTrashRetentionDays>(3);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const api = getImageWorkbenchApi();
      const [trashed, settings] = await Promise.all([api.listTrashedBoardImages(), api.getSettings()]);
      setItems(trashed);
      setRetentionDays(settings.boardTrashRetentionDays ?? 3);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法读取图片回收站。"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function changeRetention(days: BoardTrashRetentionDays): Promise<void> {
    try {
      const api = getImageWorkbenchApi();
      const settings = await api.getSettings();
      await api.saveSettings({ ...settings, boardTrashRetentionDays: days });
      setRetentionDays(days);
      await refresh();
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法更新自动清理周期。"));
    }
  }

  async function restore(item: TrashedBoardImage): Promise<void> {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const restored = await getImageWorkbenchApi().restoreTrashedBoardImage(item.id);
      if (!restored) throw new Error("图片已不在回收站中。 ");
      await onRestore(restored);
      await refresh();
      toast.success("图片已恢复到画板");
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "恢复图片失败。"));
    } finally {
      setBusyId(null);
    }
  }

  async function removePermanently(item: TrashedBoardImage): Promise<void> {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const result = await getImageWorkbenchApi().permanentlyDeleteTrashedBoardImage(item.id);
      if (!result.ok) throw new Error("图片已不在回收站中。 ");
      await refresh();
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "彻底删除图片失败。"));
    } finally {
      setBusyId(null);
    }
  }

  async function empty(): Promise<void> {
    setBusyId("empty");
    try {
      const result = await getImageWorkbenchApi().emptyTrashedBoardImages();
      setItems([]);
      setConfirmEmpty(false);
      toast.success(result.count > 0 ? `已彻底删除 ${result.count} 张图片` : "回收站已清空");
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "清空图片回收站失败。"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busyId && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(720px,calc(100vh-3rem))] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-5 py-4 text-left">
          <div className="min-w-0 flex-1">
            <DialogTitle>图片回收站</DialogTitle>
            <DialogDescription className="mt-1">已移除的画板图片可在自动清理前恢复。</DialogDescription>
          </div>
          <Select value={String(retentionDays)} disabled={loading || Boolean(busyId)} onValueChange={(value) => void changeRetention(Number(value) as BoardTrashRetentionDays)}>
            <SelectTrigger className="h-8 w-24 text-xs" aria-label="图片回收站自动清理周期"><SelectValue /></SelectTrigger>
            <SelectContent align="end">
              {retentionOptions.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={items.length === 0 || loading || Boolean(busyId)} onClick={() => setConfirmEmpty(true)}>
            <Trash2 className="h-3.5 w-3.5" />清空
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在读取回收站</div>
          ) : items.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
              <ImageOff className="mb-3 h-6 w-6" /><p className="text-sm font-medium text-foreground">没有已移除的图片</p><p className="mt-1 text-xs">从画板删除的图片会出现在这里。</p>
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {items.map((item) => {
                const busy = busyId === item.id;
                return <div key={item.id} className="flex min-h-20 items-center gap-3 py-2.5">
                  <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.boardName}</p><p className="mt-1 text-xs text-muted-foreground">{formatExpiry(item.expiresAt)}</p></div>
                  <Button variant="outline" size="sm" disabled={Boolean(busyId)} onClick={() => void restore(item)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}恢复</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={Boolean(busyId)} aria-label="彻底删除图片" onClick={() => void removePermanently(item)}><Trash2 className="h-4 w-4" /></Button>
                </div>;
              })}
            </div>
          )}
        </div>

        <Dialog open={confirmEmpty} onOpenChange={(next) => !busyId && setConfirmEmpty(next)}>
          <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>清空图片回收站</DialogTitle><DialogDescription>将永久删除 {items.length} 张图片，无法恢复。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={Boolean(busyId)} onClick={() => setConfirmEmpty(false)}>取消</Button><Button variant="destructive" disabled={Boolean(busyId)} onClick={() => void empty()}>彻底清空</Button></DialogFooter></DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function formatExpiry(expiresAt?: string): string {
  if (!expiresAt) return "不会自动清理";
  const days = Math.ceil((Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1_000));
  return days <= 1 ? "1 天内清理" : `${days} 天后清理`;
}
