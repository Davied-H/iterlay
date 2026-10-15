import { useUiText } from "@/i18n";
import { Download, Loader2 } from "lucide-react";
import type { MediaToolsState } from "@shared/media-tools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

interface MediaToolsDialogProps {
  open: boolean;
  state: MediaToolsState | null;
  starting: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function formatMediaToolsBytes(bytes: number): string {
  return `${(Math.max(0, bytes) / 1_048_576).toFixed(1)} MiB`;
}

export function MediaToolsDialog({ open, state, starting, error, onConfirm, onCancel }: MediaToolsDialogProps): React.ReactElement {
  const uiText = useUiText();

  const { locale } = useI18n();
  const zh = locale === "zh-CN";
  const busy = !error && (starting || state?.status === "downloading" || state?.status === "verifying");
  const checking = state?.status === "checking" && !error;
  const progress = state?.downloadBytes ? Math.min(100, Math.round(state.transferredBytes / state.downloadBytes * 100)) : 0;
  const statusLabel = state?.status === "verifying"
    ? zh ? "正在验证并安装…" : "Verifying and installing…"
    : checking ? zh ? "正在检查视频组件…" : "Checking video tools…"
    : zh ? "正在下载视频组件…" : "Downloading video tools…";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="z-[121] w-[calc(100%-2rem)] max-w-md" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle>{zh ? uiText("需要下载视频组件") : "Download video tools"}</DialogTitle>
          <DialogDescription>
            {zh ? uiText("视频生成后的处理和导出需要此组件。只需下载一次，应用更新后仍可使用。") : "These tools process generated videos and export sequences. Download once and reuse them across app updates."}
          </DialogDescription>
        </DialogHeader>
        {busy || checking ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              <span>{statusLabel}</span>
            </div>
            {state?.status === "downloading" ? (
              <>
                <div role="progressbar" aria-label={zh ? uiText("视频组件下载进度") : "Video tools download progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">{formatMediaToolsBytes(state.transferredBytes)} / {formatMediaToolsBytes(state.downloadBytes)} · {progress}%</p>
              </>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            {zh ? uiText("从 GitHub 下载") : "Download from GitHub"}{state?.downloadBytes ? ` · ${formatMediaToolsBytes(state.downloadBytes)}` : ""}
          </p>
        )}
        {error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{busy ? zh ? uiText("取消下载") : "Cancel download" : zh ? uiText("暂不下载") : "Not now"}</Button>
          {!busy ? <Button onClick={onConfirm} disabled={checking}>{error ? zh ? uiText("重试下载") : "Retry download" : zh ? uiText("下载并继续") : "Download and continue"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MediaToolsNotice({ state, onInstall }: { state: MediaToolsState | null; onInstall: () => void }): React.ReactElement | null {
  const uiText = useUiText();

  const { locale } = useI18n();
  if (!state || state.status === "ready" || state.status === "checking") return null;
  const zh = locale === "zh-CN";
  const busy = state.status === "downloading" || state.status === "verifying";
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-popover px-4 py-2 text-sm text-popover-foreground" role="status">
      <p className="min-w-0">{busy
        ? zh ? uiText("视频组件正在准备中，完成后可继续处理任务。") : "Video tools are being prepared. Processing can continue when they are ready."
        : zh ? uiText("生成、恢复和导出视频需要视频组件。") : "Video tools are needed to generate, resume, and export videos."}</p>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onInstall}>{busy ? zh ? uiText("查看进度") : "View progress" : zh ? uiText("安装视频组件") : "Install video tools"}</Button>
    </div>
  );
}
