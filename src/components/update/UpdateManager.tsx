import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Download, Loader2, Rocket, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import "streamdown/styles.css";
import type { InstalledUpdateRelease, UpdateChannel, UpdateProgress, UpdateStateSnapshot } from "@shared/app-update";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { useLicense } from "@/components/licensing/license-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getImageWorkbenchApi,
  getWorkbenchErrorMessage,
  hasImageWorkbenchApi,
  missingImageWorkbenchMessage
} from "@/lib/image-workbench-api";
import { cn } from "@/lib/utils";
import { UpdateContext, type UpdateContextValue } from "./update-context";

const activePhases = new Set<UpdateStateSnapshot["phase"]>(["available", "downloading", "ready", "installing"]);
const ReleaseNotesMarkdown = lazy(async () => {
  const { Streamdown } = await import("streamdown");
  return { default: Streamdown };
});

interface UpdateManagerProps {
  children: ReactNode;
}

/** 应用内更新入口：订阅主进程更新状态，负责新版本提示、下载进度与强制更新拦截。 */
export function UpdateManager({ children }: UpdateManagerProps): React.ReactElement {
  const uiText = useUiText();

  const license = useLicense();
  const bridgeAvailable = hasImageWorkbenchApi();
  const [state, setState] = useState<UpdateStateSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notificationSurfaceReady, setNotificationSurfaceReady] = useState(
    () => typeof document !== "undefined" && Boolean(document.querySelector(".iterlay-toaster"))
  );
  const notifiedVersionRef = useRef<string | null>(null);
  const manualFlowRef = useRef(false);
  const forcedCheckVersionRef = useRef<string | null>(null);
  const licenseUpdate = license.status?.state === "UPDATE_REQUIRED" ? license.status.update : undefined;
  const licenseForced = license.status?.state === "UPDATE_REQUIRED";

  useEffect(() => {
    if (!bridgeAvailable) return;
    const api = getImageWorkbenchApi();
    let disposed = false;
    api
      .getUpdateState()
      .then((snapshot) => {
        if (!disposed) setState(snapshot);
      })
      .catch(() => undefined);
    const unsubscribe = api.onUpdateState((snapshot) => setState(snapshot));
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bridgeAvailable]);

  useEffect(() => {
    if (state?.installedRelease) setReleaseOpen(true);
  }, [state?.installedRelease]);

  // App 在恢复画板时只渲染启动页，通知容器会晚于更新状态挂载。
  // 等容器可用再投递提示，避免 Sonner 丢弃首个更新通知。
  useEffect(() => {
    if (notificationSurfaceReady || typeof document === "undefined") return;
    const markReady = (): void => {
      if (document.querySelector(".iterlay-toaster")) setNotificationSurfaceReady(true);
    };
    markReady();
    const observer = new MutationObserver(markReady);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [notificationSurfaceReady]);

  // 自动检查发现新版本：普通更新弹 toast，强制更新直接打开不可关闭的对话框。
  useEffect(() => {
    if (!state?.manifest || state.phase !== "available") return;
    if (state.forced) {
      setOpen(true);
      return;
    }
    const version = state.manifest.version;
    if (!notificationSurfaceReady || manualFlowRef.current || open || notifiedVersionRef.current === version) return;
    notifiedVersionRef.current = version;
    iterlayToast.update({
      version,
      onOpen: () => setOpen(true)
    });
  }, [notificationSurfaceReady, open, state]);

  const checkNow = useCallback(async (): Promise<void> => {
    if (!hasImageWorkbenchApi()) {
      toast.error(missingImageWorkbenchMessage);
      return;
    }
    manualFlowRef.current = true;
    setChecking(true);
    try {
      const result = await getImageWorkbenchApi().checkForUpdates();
      setState(result);
      if (result.phase === "available" && result.manifest) {
        notifiedVersionRef.current = result.manifest.version;
        setOpen(true);
      } else if (result.phase === "downloading" || result.phase === "ready") {
        setOpen(true);
      } else if (result.phase === "error") {
        toast.error(result.error ?? "检查更新失败，请稍后重试。");
      } else {
        toast.success(translateSourceText("当前已是最新版本 v{{ui:0}}", [result.currentVersion]));
      }
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "检查更新失败，请稍后重试。"));
    } finally {
      manualFlowRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!licenseForced) {
      forcedCheckVersionRef.current = null;
      return;
    }
    setOpen(true);
    if (state?.forced && state.manifest) return;
    const targetVersion = licenseUpdate?.targetVersion ?? "required";
    if (forcedCheckVersionRef.current === targetVersion) return;
    forcedCheckVersionRef.current = targetVersion;
    void checkNow();
  }, [checkNow, licenseForced, licenseUpdate?.targetVersion, state?.forced, state?.manifest]);

  const openUpdateCenter = useCallback((): void => {
    if (state?.manifest && activePhases.has(state.phase)) {
      setOpen(true);
      return;
    }
    void checkNow();
  }, [checkNow, state]);

  const download = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await getImageWorkbenchApi().downloadUpdate();
      setState(snapshot);
      if (snapshot.phase === "error") {
        toast.error(snapshot.error ?? "自动安装失败，请重试。");
      }
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "下载更新失败，请稍后重试。"));
    }
  }, []);

  const dismissInstalledRelease = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await getImageWorkbenchApi().dismissInstalledRelease();
      setState(snapshot);
      setReleaseOpen(false);
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "暂时无法关闭更新说明，请重试。"));
    }
  }, []);

  const cancelDownload = useCallback((): void => {
    getImageWorkbenchApi()
      .cancelUpdateDownload()
      .catch(() => undefined);
  }, []);

  const skip = useCallback(async (version: string): Promise<void> => {
    try {
      await getImageWorkbenchApi().skipUpdateVersion(version);
      setOpen(false);
      toast.success(translateSourceText("已跳过 v{{ui:0}}，需要时可在画板库左下角重新检查更新。", [version]));
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "操作失败，请重试。"));
    }
  }, []);

  const setChannel = useCallback(async (channel: UpdateChannel): Promise<void> => {
    if (!hasImageWorkbenchApi()) {
      toast.error(missingImageWorkbenchMessage);
      return;
    }
    try {
      const snapshot = await getImageWorkbenchApi().setUpdateChannel(channel);
      setState(snapshot);
      if (channel === "beta") {
        if (snapshot.phase === "available") return; // 已有 Beta 新版本，交给统一的新版本提示。
        toast.success(translateSourceText("已加入开发者计划，有 Beta 版本时会第一时间提醒你。"));
      } else {
        toast.success(translateSourceText("已退出开发者计划，之后只接收正式版更新。"));
      }
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "切换更新渠道失败，请重试。"));
    }
  }, []);

  const manifest = state?.manifest;
  const forced = Boolean(state?.forced || licenseForced);
  const phase = state?.phase ?? "idle";
  const targetVersion = manifest?.version ?? licenseUpdate?.targetVersion;
  const hasUpdate = forced || (Boolean(manifest) && activePhases.has(phase));
  const contextValue = useMemo<UpdateContextValue>(
    () => ({ state, checking, hasUpdate, openUpdateCenter, setChannel }),
    [checking, hasUpdate, openUpdateCenter, setChannel, state]
  );

  return (
    <UpdateContext.Provider value={contextValue}>
      <div className="contents" inert={forced ? true : undefined} aria-hidden={forced ? true : undefined}>
        {children}
      </div>
      <Dialog
        open={open && Boolean(manifest || licenseForced)}
        onOpenChange={(next) => {
          if (forced && !next) return;
          setOpen(next);
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-5 p-6 sm:p-7",
            manifest?.releaseNotes && "h-[min(46rem,calc(100vh-2rem))]"
          )}
          hideClose={forced}
          onEscapeKeyDown={(event) => {
            if (forced) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (forced) event.preventDefault();
          }}
        >
          <DialogHeader>
            <div className="mb-1 flex items-center gap-3 pr-8">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${forced ? "bg-destructive/10 text-destructive" : "bg-[hsl(var(--ai-muted))] text-[hsl(var(--ai-accent))]"}`}>
                {forced ? <ShieldAlert className="h-5 w-5" aria-hidden="true" /> : <Rocket className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <DialogTitle>{forced ? uiText("需要更新后继续使用") : uiText("发现新版本")}</DialogTitle>
                <DialogDescription className="mt-1">
                  {forced
                    ? uiText("此版本已停止支持。必须完成更新，才能继续使用 Iterlay。")
                    : uiText("建议尽快更新，以获得最新功能与问题修复。")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {targetVersion ? <div className="flex items-center justify-between gap-3 border-y border-border py-3 text-sm">
            <span className="text-muted-foreground">{uiText("版本")}</span>
            <span className="flex items-center gap-2 font-medium">
              {state?.currentVersion ? (
                <>
                  v{state.currentVersion}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </>
              ) : null}
              <Badge variant={forced ? "destructive" : "default"}>v{targetVersion}</Badge>
              {manifest?.channel === "beta" ? <Badge variant="outline">Beta</Badge> : null}
            </span>
          </div> : null}

          {manifest?.releaseNotes ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/35 px-5 py-4 text-sm text-foreground [scrollbar-gutter:stable]">
              <Suspense fallback={<p className="m-0 whitespace-pre-wrap leading-7 text-muted-foreground">{manifest.releaseNotes}</p>}>
                <ReleaseNotesMarkdown
                  mode="static"
                  controls={false}
                  className="[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-4 [&_h1]:mt-0 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p]:leading-7 [&_table]:my-4 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
                >
                  {manifest.releaseNotes}
                </ReleaseNotesMarkdown>
              </Suspense>
            </div>
          ) : null}

          {phase === "downloading" ? (
            <DownloadProgressBar progress={state?.progress} onCancel={forced ? undefined : cancelDownload} />
          ) : null}

          {forced && !manifest && phase !== "error" ? (
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
              {uiText("正在获取与你的设备匹配的强制更新安装包。")}</p>
          ) : null}

          {phase === "ready" ? (
            <p className="m-0 text-sm text-muted-foreground">
              {manifest?.platform === "win32"
                ? uiText("安装包已就绪，正在准备静默替换并重启应用。")
                : uiText("安装包已就绪，正在准备自动替换并重启应用。")}
            </p>
          ) : null}

          {phase === "installing" ? (
            <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="assertive">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {uiText("安装即将开始。Iterlay 会暂时关闭，并在几秒后自动重新打开。")}</p>
          ) : null}

          {phase === "error" && state?.error ? (
            <p
              className="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <DialogFooter className="flex-wrap">
            {phase === "available" && !forced && manifest ? (
              <Button variant="ghost" onClick={() => void skip(manifest.version)}>
                {uiText("跳过此版本")}</Button>
            ) : null}
            {phase === "available" && !forced ? (
              <Button variant="outline" onClick={() => setOpen(false)}>
                {uiText("稍后")}</Button>
            ) : null}
            {phase === "available" || (phase === "error" && manifest) ? (
              <Button onClick={() => void download()}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {phase === "error" ? uiText("重试更新") : uiText("下载并自动重启")}
              </Button>
            ) : null}
            {forced && !manifest ? (
              <Button disabled={checking || phase === "checking"} onClick={() => void checkNow()}>
                {checking || phase === "checking" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {uiText("重新获取更新")}</Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InstalledReleaseDialog
        release={state?.installedRelease}
        open={releaseOpen}
        onDismiss={() => void dismissInstalledRelease()}
      />
    </UpdateContext.Provider>
  );
}

function DownloadProgressBar({
  progress,
  onCancel
}: {
  progress?: UpdateProgress;
  onCancel?: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const percent = progress?.percent;
  return (
    <div className="grid gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        {typeof percent === "number" ? (
          <div
            className="h-full rounded-full bg-[hsl(var(--ai-accent))] transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-[hsl(var(--ai-accent)/0.4)]" />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {formatBytes(progress?.transferredBytes ?? 0)}
          {progress?.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
          {typeof percent === "number" ? `（${percent}%）` : ""}
        </span>
        {onCancel ? (
          <button type="button" className="underline-offset-2 hover:underline" onClick={onCancel}>
            {uiText("取消下载")}</button>
        ) : (
          <span>{uiText("下载完成后将自动安装并重启")}</span>
        )}
      </div>
    </div>
  );
}

function InstalledReleaseDialog({
  release,
  open,
  onDismiss
}: {
  release?: InstalledUpdateRelease;
  open: boolean;
  onDismiss: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <Dialog open={open && Boolean(release)} onOpenChange={(next) => { if (!next) onDismiss(); }}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-5 p-6 sm:p-7"
        hideClose
      >
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{uiText("Iterlay 已更新")}</DialogTitle>
              <DialogDescription className="mt-1">
                {uiText("已从 v")}{release?.previousVersion} {uiText("更新到 v")}{release?.version}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {release?.releaseNotes ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/35 px-5 py-4 text-sm text-foreground [scrollbar-gutter:stable]">
            <Suspense fallback={<p className="m-0 whitespace-pre-wrap leading-7 text-muted-foreground">{release.releaseNotes}</p>}>
              <ReleaseNotesMarkdown
                mode="static"
                controls={false}
                className="[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-4 [&_h1]:mt-0 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1.5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p]:leading-7 [&_table]:my-4 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
              >
                {release.releaseNotes}
              </ReleaseNotesMarkdown>
            </Suspense>
          </div>
        ) : (
          <p className="m-0 text-sm leading-7 text-muted-foreground">{uiText("新版本已经安装完成，可以继续工作。")}</p>
        )}

        <DialogFooter>
          <Button onClick={onDismiss}>{uiText("开始使用")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
