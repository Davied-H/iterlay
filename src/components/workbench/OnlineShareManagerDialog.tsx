import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useEffect, useState } from "react";
import { Copy, Image as ImageIcon, Images, Loader2, LocateFixed, Radio, Sticker, Unplug } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import type { OnlineShareCanvasOrigin, OnlineShareSession } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

interface OnlineShareManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocate?: (origin: OnlineShareCanvasOrigin) => void;
}

export function OnlineShareManagerDialog({
  open,
  onOpenChange,
  onLocate
}: OnlineShareManagerDialogProps): React.ReactElement {
  const uiText = useUiText();

  const [session, setSession] = useState<OnlineShareSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let firstRefresh = true;
    const refresh = async (): Promise<void> => {
      if (firstRefresh) setLoading(true);
      try {
        const next = await getImageWorkbenchApi().getActiveOnlineShare();
        if (!active) return;
        const nextQrDataUrl = next
          ? await QRCode.toDataURL(next.url, {
              width: 220,
              margin: 1,
              color: { dark: "#11211b", light: "#ffffff" }
            })
          : "";
        if (!active) return;
        setSession(next);
        setQrDataUrl(nextQrDataUrl);
      } catch (error) {
        if (active) toast.error(getWorkbenchErrorMessage(error, "无法读取在线分享状态。"));
      } finally {
        if (active && firstRefresh) setLoading(false);
        firstRefresh = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  async function stopSharing(): Promise<void> {
    if (!session || stopping) return;
    setStopping(true);
    try {
      await getImageWorkbenchApi().stopOnlineShare();
      setSession(null);
      setQrDataUrl("");
      toast.success(translateSourceText("在线分享已关闭"));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法关闭在线分享。"));
    } finally {
      setStopping(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{uiText("在线分享管理")}</DialogTitle>
          <DialogDescription>
            {uiText("管理由 Manager 网络能力维持的在线连接。退出 Iterlay 时会自动关闭。")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
            {uiText("正在读取分享状态")}</div>
        ) : session ? (
          <div className="grid grid-cols-[176px_minmax(0,1fr)] gap-7 border-y border-border py-6">
            <div className="flex items-start justify-center">
              <div className="rounded-md bg-white p-2.5 shadow-sm">
                {qrDataUrl ? <img src={qrDataUrl} alt={uiText("当前在线分享二维码")} className="h-[156px] w-[156px]" /> : null}
              </div>
            </div>
            <div className="min-w-0 py-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--helper-line))]">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--helper-line))] opacity-30 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--helper-line))]" />
                </span>
                {uiText("在线连接中")}</div>
              <div className="mt-3 flex items-center gap-2">
                {session.kind === "image"
                  ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <Sticker className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <p className="truncate text-sm font-medium text-foreground" title={session.title}>{session.title}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {formatShareKind(session)}
                {" · "}
                {formatRemaining(session.expiresAt)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.origin && onLocate ? (
                  <Button onClick={() => onLocate(session.origin!)}>
                    {session.origin.nodeIds.length > 1
                      ? <Images className="h-4 w-4" />
                      : <LocateFixed className="h-4 w-4" />}
                    {session.origin.nodeIds.length > 1
                      ? uiText("回到画板并选中 {{ui:0}} 张图片", [session.origin.nodeIds.length])
                      : uiText("回到分享图片")}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(session.url);
                    toast.success(translateSourceText("分享链接已复制"));
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {uiText("复制链接")}</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center border-y border-border text-center">
            <Radio className="h-7 w-7 text-muted-foreground/70" />
            <p className="mt-3 text-sm font-medium text-foreground">{uiText("当前没有在线分享")}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {uiText("生成单图或表情包二维码后，连接会显示在这里。")}</p>
          </div>
        )}

        <DialogFooter>
          {session ? (
            <Button variant="destructive" onClick={() => void stopSharing()} disabled={stopping}>
              {stopping
                ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                : <Unplug className="h-4 w-4" />}
              {stopping ? uiText("正在关闭") : uiText("关闭在线分享")}
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{uiText("完成")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatRemaining(expiresAt: number): string {
  const minutes = Math.max(0, Math.ceil((expiresAt - Date.now()) / 60_000));
  if (minutes <= 0) return "即将到期";
  if (minutes < 60) return `剩余约 ${minutes} 分钟`;
  return `剩余约 ${Math.ceil(minutes / 60)} 小时`;
}

function formatShareKind(session: OnlineShareSession): string {
  const count = session.origin?.nodeIds.length ?? 1;
  if (session.kind !== "image") return count > 1 ? `${count} 张微信表情分享` : "微信表情包分享";
  return count > 1 ? `${count} 张图片快速分享` : "单张图片快速分享";
}
