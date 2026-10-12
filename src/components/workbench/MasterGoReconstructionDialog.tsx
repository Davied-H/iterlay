import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CircleCheck,
  Download,
  FileCode2,
  FileImage,
  ExternalLink,
  ImageDown,
  Layers3,
  Loader2,
  PanelTop,
  RefreshCw,
  ScanSearch,
  Square,
  Unplug,
  Upload,
  WandSparkles
} from "lucide-react";
import type {
  MasterGoConnectionState,
  MasterGoReconstructionMode,
  MasterGoReconstructionPreparation,
  MasterGoReconstructionTask
} from "@shared/mastergo-reconstruction";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  source: { path: string; name: string; dataUrl: string; width?: number; height?: number } | null;
  textProviderId?: string;
  onOpenChange: (open: boolean) => void;
}

type DialogPhase = "checking" | "disconnected" | "ready" | "running" | "completed" | "failed";

const stageLabels: Record<MasterGoReconstructionTask["stage"], string> = {
  queued: "创建任务",
  preparing: "读取图片",
  planning: "读取 MasterGo 规则",
  analyzing: "识别界面",
  building: "构建图层",
  submitting: "写入 MasterGo",
  rendering: "MasterGo 生成中",
  completed: "完成",
  failed: "失败",
  cancelled: "已取消"
};

const motionEase = [0.22, 1, 0.36, 1] as const;
const stateTransition = { duration: 0.24, ease: motionEase } as const;

export function MasterGoReconstructionDialog({
  open,
  source,
  textProviderId,
  onOpenChange
}: Props): React.ReactElement {
  const [connection, setConnection] = useState<MasterGoConnectionState | null>(null);
  const [preparation, setPreparation] = useState<MasterGoReconstructionPreparation | null>(null);
  const [task, setTask] = useState<MasterGoReconstructionTask | null>(null);
  const [frameName, setFrameName] = useState("");
  const [strategy, setStrategy] = useState<"fidelity" | "balanced">("fidelity");
  const [mode, setMode] = useState<MasterGoReconstructionMode>("ui");
  const [evolutionEnabled, setEvolutionEnabled] = useState(true);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const sourceName = source?.name;
  const sourcePath = source?.path;
  const sourceWidth = source?.width;
  const sourceHeight = source?.height;

  const defaultFrameName = useMemo(() => {
    const base = sourceName?.replace(/\.[^.]+$/u, "").trim() || "未命名界面";
    return `${base} - 可编辑稿`;
  }, [sourceName]);

  const phase: DialogPhase = task?.status === "completed"
    ? "completed"
    : task?.status === "failed" || task?.status === "cancelled"
      ? "failed"
      : task?.status === "running"
        ? "running"
        : connection?.status === "disconnected"
          ? "disconnected"
          : connection?.status === "connected" && preparation
            ? "ready"
            : "checking";
  const taskId = task?.id;
  const taskStatus = task?.status;

  const checkConnection = useCallback(async (): Promise<void> => {
    if (!sourceName || isChecking) return;
    setIsChecking(true);
    setTask(null);
    setError("");
    try {
      const api = getImageWorkbenchApi();
      const nextConnection = await api.getMasterGoConnection(true);
      if (nextConnection.status !== "connected") {
        setConnection(nextConnection);
        setPreparation(null);
        return;
      }
      const nextPreparation = await api.prepareMasterGoReconstruction({
        sourceName,
        frameName: frameName.trim() || defaultFrameName,
        mode,
        width: sourceWidth,
        height: sourceHeight
      });
      setConnection(nextConnection);
      setPreparation(nextPreparation);
    } catch (nextError) {
      setError(getWorkbenchErrorMessage(nextError, "无法连接 MasterGo。"));
      setConnection({
        status: "disconnected",
        reason: "local-service-unavailable",
        message: getWorkbenchErrorMessage(nextError, "无法连接 MasterGo。")
      });
      setPreparation(null);
    } finally {
      setIsChecking(false);
    }
  }, [defaultFrameName, frameName, isChecking, mode, sourceHeight, sourceName, sourceWidth]);

  useEffect(() => {
    if (!open || !sourceName || !sourcePath) return;
    setFrameName(defaultFrameName);
    setStrategy("fidelity");
    setMode("ui");
    setEvolutionEnabled(true);
    setTask(null);
    setError("");
    void (async () => {
      setIsChecking(true);
      setConnection(null);
      setPreparation(null);
      try {
        const api = getImageWorkbenchApi();
        const nextConnection = await api.getMasterGoConnection(true);
        if (nextConnection.status !== "connected") {
          setConnection(nextConnection);
          return;
        }
        const nextPreparation = await api.prepareMasterGoReconstruction({
          sourceName,
          frameName: defaultFrameName,
          mode: "ui",
          width: sourceWidth,
          height: sourceHeight
        });
        setConnection(nextConnection);
        setPreparation(nextPreparation);
      } catch (nextError) {
        const message = getWorkbenchErrorMessage(nextError, "无法连接 MasterGo。");
        setError(message);
        setConnection({
          status: "disconnected",
          reason: "local-service-unavailable",
          message
        });
      } finally {
        setIsChecking(false);
      }
    })();
  }, [defaultFrameName, open, sourceHeight, sourceName, sourcePath, sourceWidth]);

  useEffect(() => {
    if (!taskId || taskStatus !== "running") return;
    let disposed = false;
    const poll = window.setInterval(() => {
      void getImageWorkbenchApi().getMasterGoReconstructionTask(taskId)
        .then((nextTask) => {
          if (!disposed) setTask(nextTask);
        })
        .catch((nextError) => {
          if (!disposed) setError(getWorkbenchErrorMessage(nextError, "读取还原进度失败。"));
        });
    }, 650);
    return () => {
      disposed = true;
      window.clearInterval(poll);
    };
  }, [taskId, taskStatus]);

  const start = async (): Promise<void> => {
    if (!source || !preparation || !frameName.trim()) return;
    setError("");
    try {
      const api = getImageWorkbenchApi();
      // Keep the MasterGo requirement aligned with the selected mode and final name.
      const activePreparation = await api.prepareMasterGoReconstruction({
        sourceName: source.name,
        frameName: frameName.trim(),
        mode,
        width: source.width,
        height: source.height
      });
      setPreparation(activePreparation);
      setTask(await api.startMasterGoReconstruction({
        preparationId: activePreparation.id,
        sourcePath: source.path,
        sourceName: source.name,
        width: source.width,
        height: source.height,
        frameName: frameName.trim(),
        target: "current-page",
        strategy,
        mode,
        evolutionEnabled
      }, textProviderId));
    } catch (nextError) {
      setError(getWorkbenchErrorMessage(nextError, "无法开始还原。"));
    }
  };

  const cancel = async (): Promise<void> => {
    if (!task || task.status !== "running") return;
    try {
      setTask(await getImageWorkbenchApi().cancelMasterGoReconstructionTask(task.id));
    } catch (nextError) {
      setError(getWorkbenchErrorMessage(nextError, "取消任务失败。"));
    }
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && task?.status === "running") {
      if (!isMasterGoRemoteStage(task.stage)) void cancel();
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[min(820px,calc(100vh-32px))] gap-0 overflow-y-auto p-0",
          task?.status === "completed" && task.result?.mode === "photo-layers" ? "max-w-4xl" : "max-w-xl"
        )}
        aria-describedby="mastergo-reconstruction-description"
        hideClose={task?.status === "running"}
        onEscapeKeyDown={(event) => {
          if (task?.status === "running") event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (task?.status === "running") event.preventDefault();
        }}
      >
        <DialogHeader className="gap-1 px-5 pb-2 pt-4 pr-10 sm:flex-row sm:items-center sm:gap-2">
          <DialogTitle className="flex shrink-0 items-center gap-2 text-base">
            <PanelTop className="h-4 w-4" />
            还原为可编辑设计稿
          </DialogTitle>
          <span className="hidden text-border sm:block" aria-hidden="true">·</span>
          <DialogDescription id="mastergo-reconstruction-description" className="text-xs leading-5">
            {mode === "photo-layers"
              ? "补全背景并提取主体，通过 MasterGo MCP 写入当前页面。"
              : "拆分 UI 元素，通过 MasterGo MCP 写入当前页面。"}
          </DialogDescription>
        </DialogHeader>

        {phase === "checking" ? <CheckingState /> : null}
        {phase === "disconnected" ? (
          <DisconnectedState
            message={connection?.status === "disconnected" ? connection.message : error}
            checking={isChecking}
            onRetry={() => void checkConnection()}
          />
        ) : null}
        {phase === "ready" && source && preparation ? (
          <ReadyState
            source={source}
            preparation={preparation}
            frameName={frameName}
            strategy={strategy}
            mode={mode}
            evolutionEnabled={evolutionEnabled}
            onFrameNameChange={setFrameName}
            onStrategyChange={setStrategy}
            onModeChange={setMode}
            onEvolutionEnabledChange={setEvolutionEnabled}
          />
        ) : null}
        {(phase === "running" || phase === "completed" || phase === "failed") && task ? (
          <MasterGoReconstructionTaskState task={task} sourceDataUrl={source?.dataUrl} />
        ) : null}

        {error && phase !== "disconnected" && phase !== "failed" ? (
          <p className="border-t bg-destructive/5 px-6 py-3 text-sm text-destructive">{error}</p>
        ) : null}

        <DialogFooter className="border-t px-6 py-4">
          {phase === "ready" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button disabled={!frameName.trim()} onClick={() => void start()}>
                <WandSparkles className="h-4 w-4" />
                开始还原
              </Button>
            </>
          ) : phase === "running" ? (
            isMasterGoRemoteStage(task?.stage) ? (
              <p className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                正在写入 MasterGo，请勿关闭
              </p>
            ) : (
              <Button variant="outline" onClick={() => void cancel()}>取消任务</Button>
            )
          ) : phase === "completed" ? (
            <Button onClick={() => onOpenChange(false)}>
              <Check className="h-4 w-4" />
              完成
            </Button>
          ) : phase === "failed" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
              <Button onClick={() => void checkConnection()}>
                <RefreshCw className="h-4 w-4" />
                重新开始
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckingState(): React.ReactElement {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
      <div>
        <p className="text-sm font-medium">正在连接 MasterGo</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">自动检测当前文件，并准备官方 Vibe MCP</p>
      </div>
    </div>
  );
}

function DisconnectedState({
  message,
  checking,
  onRetry
}: {
  message: string;
  checking: boolean;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="px-6 py-6" aria-busy={checking}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Unplug className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">还差一步即可连接</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 border-y py-4 text-sm">
        <ConnectionStep number="1" text="打开 MasterGo 桌面客户端和目标设计文件" />
        <ConnectionStep number="2" text="在文件右上角点击“ＭCP 未连接”，完成连接" />
        <ConnectionStep number="3" text="回到这里重新检查；Vibe MCP 不需要 Token" />
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={checking} onClick={onRetry}>
          <RefreshCw className={cn("h-4 w-4", checking && "animate-spin motion-reduce:animate-none")} />
          {checking ? "正在检查" : "重新检查"}
        </Button>
        <Button variant="outline" onClick={() => void getImageWorkbenchApi().openMasterGoSetup("download")}>
          <ExternalLink className="h-4 w-4" />
          安装 MasterGo
        </Button>
        <Button variant="ghost" onClick={() => void getImageWorkbenchApi().openMasterGoSetup("guide")}>
          官方连接指南
        </Button>
      </div>
      <p className="mt-4 border-t pt-4 text-xs leading-5 text-muted-foreground">
        个人访问令牌只用于旧的 Magic MCP；图片还原使用本地 Vibe MCP，不读取个人令牌。
      </p>
    </div>
  );
}

function ConnectionStep({ number, text }: { number: string; text: string }): React.ReactElement {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground">
        {number}
      </span>
      <span>{text}</span>
    </li>
  );
}

function ReadyState({
  source,
  preparation,
  frameName,
  strategy,
  mode,
  evolutionEnabled,
  onFrameNameChange,
  onStrategyChange,
  onModeChange,
  onEvolutionEnabledChange
}: {
  source: NonNullable<Props["source"]>;
  preparation: MasterGoReconstructionPreparation;
  frameName: string;
  strategy: "fidelity" | "balanced";
  mode: MasterGoReconstructionMode;
  evolutionEnabled: boolean;
  onFrameNameChange: (value: string) => void;
  onStrategyChange: (value: "fidelity" | "balanced") => void;
  onModeChange: (value: MasterGoReconstructionMode) => void;
  onEvolutionEnabledChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="grid gap-5 px-6 py-5">
      <div className="flex items-center gap-3">
        <img className="h-14 w-20 shrink-0 rounded-md border object-cover" src={source.dataUrl} alt="" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{source.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileImage className="h-3.5 w-3.5" />
            将拆分为独立可编辑图层
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="mastergo-target">目标画板</Label>
        <Select value="current-page">
          <SelectTrigger id="mastergo-target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current-page">{preparation.targetName}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs leading-5 text-muted-foreground">生成时请不要在 MasterGo 中切换文件或页面。</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="mastergo-frame-name">设计稿名称</Label>
        <Input
          id="mastergo-frame-name"
          value={frameName}
          maxLength={80}
          onChange={(event) => onFrameNameChange(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>生成类型</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="生成类型">
          <ModeButton
            selected={mode === "ui"}
            title="可编辑 UI"
            description="拆分文字、容器和图标"
            onClick={() => onModeChange("ui")}
          />
          <ModeButton
            selected={mode === "photo-layers"}
            title="AI 照片分层"
            description="自动补全背景和独立物体"
            onClick={() => onModeChange("photo-layers")}
          />
        </div>
      </div>

      {mode === "ui" ? <div className="grid gap-2">
        <Label>还原方式</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="还原方式">
          <ModeButton
            selected={strategy === "fidelity"}
            title="高保真"
            description="优先匹配原图"
            onClick={() => onStrategyChange("fidelity")}
          />
          <ModeButton
            selected={strategy === "balanced"}
            title="易维护"
            description="优化重复结构"
            onClick={() => onStrategyChange("balanced")}
          />
        </div>
      </div> : null}

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <div className="min-w-0">
          <Label htmlFor="mastergo-agent-evolution" className="text-sm">Pi Agent 自动进化</Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">汇总已核验任务的执行信号，用于下一次还原的结构与视觉检查。</p>
        </div>
        <Switch
          id="mastergo-agent-evolution"
          checked={evolutionEnabled}
          onCheckedChange={onEvolutionEnabledChange}
          aria-label="Pi Agent 自动进化"
        />
      </div>

      <div className="flex items-start gap-2 border-t pt-4 text-xs leading-5 text-muted-foreground">
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>{mode === "photo-layers" ? "照片会保留为独立位图图层，不重绘为 UI 元素。" : `${preparation.modeName}：${preparation.modeDescription}`}</span>
      </div>
    </div>
  );
}

function ModeButton({
  selected,
  title,
  description,
  onClick
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        "flex min-h-16 items-start gap-2 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <span className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        selected && "border-primary"
      )}>
        {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function MasterGoReconstructionTaskState({
  task,
  sourceDataUrl
}: {
  task: MasterGoReconstructionTask;
  sourceDataUrl?: string;
}): React.ReactElement {
  const completed = task.status === "completed";
  const failed = task.status === "failed" || task.status === "cancelled";
  const reduceMotion = useReducedMotion();
  const activeStepIndex = getActiveStepIndex(task.stage);
  return (
    <div className="px-6 pb-6 pt-4">
      <div className="flex items-start gap-4">
        {sourceDataUrl ? <img className="h-16 w-24 shrink-0 rounded-md border object-cover" src={sourceDataUrl} alt="" /> : null}
        <div className="min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={`${task.status}-${task.stage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: motionEase }}
              className="flex items-center gap-2"
            >
              {completed ? <CircleCheck className="h-4 w-4 text-emerald-600" /> : failed ? <Unplug className="h-4 w-4 text-destructive" /> : <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />}
              <p className="text-sm font-medium">{completed ? "可编辑设计稿已创建" : stageLabels[task.stage]}</p>
            </motion.div>
          </AnimatePresence>
          <div className="relative mt-1 min-h-6 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                key={task.error || task.message}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: motionEase }}
                className={cn("text-sm leading-6 text-muted-foreground", failed && "text-destructive")}
              >
                {task.error || task.message}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {!failed ? <div className="mt-6" aria-label={`任务进度 ${task.progress}%`}>
        <HorizontalPipeline activeStepIndex={activeStepIndex} completed={completed} progress={task.progress} reduceMotion={reduceMotion} />
        <AnimatePresence initial={false} mode="wait">
          <StageDetail
            key={reconstructionSteps[activeStepIndex].id}
            step={reconstructionSteps[activeStepIndex]}
            progress={task.progress}
            taskMessage={task.message}
            completed={completed}
            reduceMotion={reduceMotion}
          />
        </AnimatePresence>
      </div> : null}

      {completed ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: motionEase }}
          className="relative mt-6 grid gap-3 overflow-hidden border-t pt-5 text-sm"
        >
          <div className="flex items-center gap-2 font-medium text-emerald-700">
            <CircleCheck className="h-4 w-4" />
            已写入 MasterGo
          </div>
          <ResultLine icon={<PanelTop className="h-3.5 w-3.5" />} label="目标" value={task.result?.targetName || "当前 MasterGo 页面"} />
          <ResultLine icon={<Square className="h-3.5 w-3.5" />} label="名称" value={task.result?.frameName || "可编辑设计稿"} />
        </motion.div>
      ) : null}

      {completed && task.result?.mode === "ui" && task.result.html ? <HtmlResultWorkspace task={task} /> : null}
      {completed && task.result?.mode === "photo-layers" && task.result.canvas && task.result.layers ? <PhotoLayerWorkspace task={task} /> : null}
    </div>
  );
}

function HtmlResultWorkspace({ task }: { task: MasterGoReconstructionTask }): React.ReactElement {
  const result = task.result!;
  const reduceMotion = useReducedMotion();
  const [html, setHtml] = useState(result.html || "");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"render" | "download" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setHtml(result.html || "");
  }, [result.html]);

  const downloadHtml = async (): Promise<void> => {
    setBusy("download");
    setError("");
    try {
      await getImageWorkbenchApi().downloadMasterGoHtml({ frameName: result.frameName, html });
    } catch (nextError) {
      setError(getWorkbenchErrorMessage(nextError, "HTML 下载失败。"));
    } finally {
      setBusy(null);
    }
  };

  const renderImage = async (): Promise<void> => {
    setBusy("render");
    setError("");
    try {
      setPreview(await getImageWorkbenchApi().renderMasterGoEditedHtml(task.id, html));
    } catch (nextError) {
      setError(getWorkbenchErrorMessage(nextError, "无法将 HTML 转为图片。"));
    } finally {
      setBusy(null);
    }
  };

  return <section className="mt-6 border-t pt-5">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-medium">HTML 结果</p><p className="mt-0.5 text-xs text-muted-foreground">修改后可重新写入 MasterGo 并生成图片</p></div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void downloadHtml()}><Download className="h-3.5 w-3.5" />{busy === "download" ? "下载中" : "下载 HTML"}</Button>
        <Button size="sm" disabled={busy !== null} onClick={() => void renderImage()}>{busy === "render" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <ImageDown className="h-3.5 w-3.5" />}生成图片</Button>
      </div>
    </div>
    <div className="mt-3 grid overflow-hidden rounded-md border md:grid-cols-2">
      <label className="grid min-h-72 border-b bg-muted/[0.16] md:border-b-0 md:border-r">
        <span className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">HTML</span>
        <textarea value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} className="min-h-64 w-full resize-y bg-transparent p-3 font-mono text-xs leading-5 outline-none" aria-label="编辑 HTML" />
      </label>
      <div className="grid min-h-72 bg-white">
        <span className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">预览</span>
        <AnimatePresence initial={false} mode="wait">
          {preview ? <motion.div
            key="rendered-image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: motionEase }}
            className="min-h-0 overflow-auto bg-muted/30 p-3"
          >
            <img src={preview} alt="修改后的设计稿" className="h-auto w-full border bg-white" />
          </motion.div> : <motion.iframe
            key="html-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: motionEase }}
            title="HTML 预览"
            srcDoc={html}
            sandbox=""
            className="h-64 w-full border-0 bg-white"
          />}
        </AnimatePresence>
      </div>
    </div>
    {error ? <p className="mt-2 text-xs leading-5 text-destructive">{error}</p> : null}
  </section>;
}

function PhotoLayerWorkspace({ task }: { task: MasterGoReconstructionTask }): React.ReactElement {
  const result = task.result!;
  const canvas = result.canvas!;
  const initialLayers = result.layers!;
  const [sources, setSources] = useState<Record<string, string>>({});
  const [layers, setLayers] = useState(initialLayers);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [busy, setBusy] = useState<"assets" | "psd" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLayers(initialLayers);
    void Promise.all(initialLayers.map(async (layer) => [layer.id, await getImageWorkbenchApi().readMasterGoLayerAsset(layer.path)] as const))
      .then((items) => setSources(Object.fromEntries(items)))
      .catch((nextError) => setError(getWorkbenchErrorMessage(nextError, "无法读取分层素材。")));
  }, [initialLayers]);

  const downloadLayer = (layer: typeof initialLayers[number]): void => {
    const source = sources[layer.id];
    if (!source) return;
    const link = document.createElement("a");
    link.href = source;
    link.download = `${layer.name}.png`;
    link.click();
  };
  const exportLayers = async (): Promise<void> => {
    setBusy("assets"); setError("");
    try { await getImageWorkbenchApi().downloadMasterGoLayers({ frameName: result.frameName, layers }); }
    catch (nextError) { setError(getWorkbenchErrorMessage(nextError, "分层素材下载失败。")); }
    finally { setBusy(null); }
  };
  const exportPsd = async (): Promise<void> => {
    setBusy("psd"); setError("");
    try { await getImageWorkbenchApi().exportMasterGoPsd({ frameName: result.frameName, canvas, layers }); }
    catch (nextError) { setError(getWorkbenchErrorMessage(nextError, "PSD 导出失败。")); }
    finally { setBusy(null); }
  };

  return <section className="mt-6 border-t pt-5">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-medium">分层画布</p><p className="mt-0.5 text-xs text-muted-foreground">拖拽素材调整位置，导出会保留当前图层坐标</p></div>
      <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void exportLayers()}><Download className="h-3.5 w-3.5" />全部素材</Button><Button size="sm" disabled={busy !== null} onClick={() => void exportPsd()}>{busy === "psd" ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Layers3 className="h-3.5 w-3.5" />}导出 PSD</Button></div>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
      <div
        className="relative overflow-hidden border bg-[radial-gradient(#d4d4d8_0.75px,transparent_0.75px)] [background-size:12px_12px]"
        style={{ aspectRatio: `${canvas.width}/${canvas.height}` }}
        onPointerMove={(event) => {
          if (!drag) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setLayers((current) => current.map((layer) => layer.id !== drag.id ? layer : {
            ...layer,
            x: Math.max(0, Math.min(canvas.width - layer.width, ((event.clientX - bounds.left) / bounds.width) * canvas.width - drag.offsetX)),
            y: Math.max(0, Math.min(canvas.height - layer.height, ((event.clientY - bounds.top) / bounds.height) * canvas.height - drag.offsetY))
          }));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {[...layers].reverse().map((layer) => sources[layer.id] ? <img key={layer.id} src={sources[layer.id]} alt={layer.name} draggable={false} onPointerDown={(event) => {
          const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ id: layer.id, offsetX: ((event.clientX - bounds.left) / bounds.width) * canvas.width - layer.x, offsetY: ((event.clientY - bounds.top) / bounds.height) * canvas.height - layer.y });
        }} className="absolute cursor-grab select-none active:cursor-grabbing" style={{ left: `${(layer.x / canvas.width) * 100}%`, top: `${(layer.y / canvas.height) * 100}%`, width: `${(layer.width / canvas.width) * 100}%`, height: `${(layer.height / canvas.height) * 100}%` }} /> : null)}
      </div>
      <div className="divide-y overflow-hidden rounded-md border bg-background">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground">图层 · {layers.length}</p>
        {layers.map((layer) => <div key={layer.id} className="flex items-center gap-2 px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs">{layer.name}</span><button type="button" onClick={() => downloadLayer(layer)} className="text-muted-foreground hover:text-foreground" aria-label={`下载 ${layer.name}`}><Download className="h-3.5 w-3.5" /></button></div>)}
      </div>
    </div>
    {error ? <p className="mt-2 text-xs leading-5 text-destructive">{error}</p> : null}
  </section>;
}

const reconstructionSteps = [
  {
    id: "preparing",
    label: "准备源图",
    icon: FileImage,
    range: [5, 16],
    children: [
      { label: "读取输入图片", output: ["源图"] },
      { label: "提取画布信息", output: ["尺寸", "色彩模式"] },
      { label: "校验目标画板", output: ["目标画板"] }
    ]
  },
  {
    id: "planning",
    label: "解析 MasterGo 规则",
    icon: FileCode2,
    range: [17, 30],
    children: [
      { label: "连接当前页面", output: ["页面树"] },
      { label: "读取可用组件", output: ["组件约束"] },
      { label: "整理布局规则", output: ["规则摘要"] }
    ]
  },
  {
    id: "analyzing",
    label: "识别界面结构",
    icon: ScanSearch,
    range: [31, 54],
    children: [
      { label: "识别页面区域", output: ["区域树"] },
      { label: "提取文本与素材", output: ["文本块", "素材清单"] },
      { label: "归类可复用元素", output: ["元素分组"] }
    ]
  },
  {
    id: "building",
    label: "构建可编辑图层",
    icon: Layers3,
    range: [55, 77],
    children: [
      { label: "生成图层树", output: ["图层树"] },
      { label: "还原布局结构", output: ["布局结构"] },
      { label: "应用样式属性", output: ["样式令牌"] }
    ]
  },
  {
    id: "submitting",
    label: "写入 MasterGo",
    icon: Upload,
    range: [78, 85],
    children: [
      { label: "创建目标画板", output: ["目标画板"] },
      { label: "写入设计节点", output: ["节点写入"] },
      { label: "同步页面内容", output: ["页面更新"] }
    ]
  },
  {
    id: "rendering",
    label: "核验最终图层",
    icon: PanelTop,
    range: [86, 100],
    children: [
      { label: "等待图层生成", output: ["最终图层"] },
      { label: "核对布局与素材", output: ["视觉核验"] },
      { label: "确认可编辑状态", output: ["核验结果"] }
    ]
  }
] as const;

function HorizontalPipeline({
  activeStepIndex,
  completed,
  progress,
  reduceMotion
}: {
  activeStepIndex: number;
  completed: boolean;
  progress: number;
  reduceMotion: boolean | null;
}): React.ReactElement {
  const lineProgress = completed ? 1 : activeStepIndex / (reconstructionSteps.length - 1);
  return <div className="relative grid grid-cols-6" aria-label="还原阶段">
    <span className="absolute left-[8.333%] right-[8.333%] top-[17px] h-px overflow-hidden bg-border" aria-hidden="true">
      <motion.span
        className="block h-full origin-left bg-emerald-600"
        initial={false}
        animate={{ scaleX: lineProgress }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: motionEase }}
      />
    </span>
    {reconstructionSteps.map((step, index) => {
      const state = completed || index < activeStepIndex ? "completed" : index === activeStepIndex ? "running" : "pending";
      const stageProgress = getStageProgress(step.range, progress, completed);
      return <div key={step.id} className="relative flex min-w-0 flex-col items-center text-center">
        <motion.span
          layout
          className={cn(
            "relative z-10 flex h-9 w-9 items-center justify-center rounded-full",
            state === "completed" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground"
          )}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: motionEase }}
        >
          {state === "running" ? <>
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <motion.circle
                cx="18"
                cy="18"
                r="16"
                pathLength="1"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                initial={false}
                animate={{ pathLength: stageProgress / 100 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: motionEase }}
              />
            </svg>
          </> : null}
          <span className={cn(
            "relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors duration-200 motion-reduce:transition-none",
            state === "completed" ? "bg-emerald-600 text-white" : "bg-background",
            state === "running" && "text-primary"
          )}>
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={state}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: motionEase }}
                className="flex items-center justify-center"
              >
                {state === "completed" ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
        <motion.span
          animate={{ opacity: state === "pending" ? 0.72 : 1 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: motionEase }}
          className={cn("mt-2 line-clamp-2 text-[11px] leading-4", state === "pending" ? "text-muted-foreground" : "font-medium text-foreground")}
        >
          {step.label}
        </motion.span>
      </div>;
    })}
  </div>;
}

function StageDetail({
  step,
  progress,
  taskMessage,
  completed,
  reduceMotion
}: {
  step: typeof reconstructionSteps[number];
  progress: number;
  taskMessage: string;
  completed: boolean;
  reduceMotion: boolean | null;
}): React.ReactElement {
  const StageIcon = step.icon;
  const stageProgress = getStageProgress(step.range, progress, completed);
  const activeChildIndex = completed ? step.children.length : Math.min(step.children.length - 1, Math.floor(stageProgress / (100 / step.children.length)));
  return <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: motionEase }}
    className="mt-5 overflow-hidden rounded-md border bg-muted/[0.18]"
  >
    <div className="relative flex items-center justify-between overflow-hidden border-b bg-background px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <StageIcon className="h-3.5 w-3.5" />
        </span>
        <div><p className="text-sm font-medium">{step.label}</p><p className="text-[11px] text-muted-foreground">阶段内进度</p></div>
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{Math.round(stageProgress)}%</span>
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-muted" aria-hidden="true">
        <motion.span
          className="block h-full origin-left bg-primary"
          initial={false}
          animate={{ scaleX: stageProgress / 100 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: motionEase }}
        />
      </span>
    </div>
    <div className="px-4 py-1">
      {step.children.map((child, index) => <StageChild
        key={child.label}
        child={child}
        state={completed || index < activeChildIndex ? "completed" : index === activeChildIndex ? "running" : "pending"}
        taskMessage={taskMessage}
        reduceMotion={reduceMotion}
      />)}
    </div>
  </motion.div>;
}

function StageChild({ child, state, taskMessage, reduceMotion }: {
  child: typeof reconstructionSteps[number]["children"][number];
  state: "completed" | "running" | "pending";
  taskMessage: string;
  reduceMotion: boolean | null;
}): React.ReactElement {
  const running = state === "running";
  return <motion.div
    layout
    transition={reduceMotion ? { duration: 0 } : stateTransition}
    className="relative flex gap-3 px-2 py-3"
  >
    {running ? <motion.span
      layoutId="mastergo-active-child"
      className="absolute inset-0 rounded-md bg-primary/[0.045]"
      transition={reduceMotion ? { duration: 0 } : stateTransition}
      aria-hidden="true"
    /> : null}
    <motion.span
      layout
      className={cn("relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", state === "completed" ? "border-emerald-600 bg-emerald-600 text-white" : running ? "border-primary bg-background text-primary" : "border-muted-foreground/20 bg-muted text-muted-foreground/50")}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: motionEase }}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.12, ease: motionEase }}
          className="flex items-center justify-center"
        >
          {state === "completed" ? <Check className="h-3 w-3" strokeWidth={3} /> : running ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        </motion.span>
      </AnimatePresence>
    </motion.span>
    <div className="relative z-10 min-w-0 flex-1">
      <div className="flex items-center gap-2"><p className={cn("text-sm", state !== "pending" && "font-medium", state === "pending" && "text-muted-foreground")}>{child.label}</p>{running ? <span className="text-[11px] text-primary">处理中</span> : null}</div>
      <AnimatePresence initial={false} mode="popLayout">
        {running ? <motion.p
          key={taskMessage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: motionEase }}
          className="mt-1 text-xs leading-5 text-muted-foreground"
        >
          {taskMessage}
        </motion.p> : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {state === "completed" ? <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: motionEase }}
          className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-emerald-700"
        >
          <span className="mr-0.5">已识别</span>
          {child.output.map((item) => <span
            key={item}
            className="rounded-sm border border-emerald-600/15 bg-emerald-600/5 px-1.5 py-px leading-4"
          >
            {item}
          </span>)}
        </motion.div> : null}
      </AnimatePresence>
    </div>
  </motion.div>;
}

function getStageProgress(range: readonly [number, number], progress: number, completed: boolean): number {
  if (completed) return 100;
  const [start, end] = range;
  return Math.max(0, Math.min(100, ((progress - start) / (end - start)) * 100));
}

function getActiveStepIndex(stage: MasterGoReconstructionTask["stage"]): number {
  if (stage === "queued" || stage === "preparing") return 0;
  if (stage === "planning") return 1;
  if (stage === "analyzing") return 2;
  if (stage === "building") return 3;
  if (stage === "submitting") return 4;
  return 5;
}

function ResultLine({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-10 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function isMasterGoRemoteStage(stage?: MasterGoReconstructionTask["stage"]): boolean {
  return stage === "submitting" || stage === "rendering";
}
