import { useUiText } from "@/i18n";
import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, Copy, Download, FolderOpen, Loader2, Plug, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PiAgentLogPanel } from "@/components/workbench/PiAgentLogPanel";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

export function McpIntegrationPanel({
  clients,
  action,
  step,
  error,
  pluginPackageAction,
  pluginPackagePaths,
  pluginPackageError,
  disabled,
  codexExamplesOpen,
  onCodexExamplesOpenChange,
  onSetup,
  onRemove,
  onExportPluginPackage,
  onOpenPluginPackage
}: {
  clients: Array<{
    id: "codex" | "claude-code";
    configured: boolean;
    configPath: string;
    skillInstalled: boolean;
    skillPath: string;
  }>;
  action: `${"setup" | "remove"}:${"codex" | "claude-code"}` | null;
  step: { client: "codex" | "claude-code"; label: string } | null;
  error: string | null;
  pluginPackageAction: "codex" | "claude-code" | null;
  pluginPackagePaths: Partial<Record<"codex" | "claude-code", string>>;
  pluginPackageError: string | null;
  disabled: boolean;
  codexExamplesOpen: boolean;
  onCodexExamplesOpenChange: (open: boolean) => void;
  onSetup: (client: "codex" | "claude-code") => Promise<void>;
  onRemove: (client: "codex" | "claude-code") => Promise<void>;
  onExportPluginPackage: (client: "codex" | "claude-code") => Promise<void>;
  onOpenPluginPackage: (targetPath: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [removalTarget, setRemovalTarget] = useState<{
    id: "codex" | "claude-code";
    title: string;
  } | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);
  const entries = [
    { id: "codex" as const, title: "Codex", description: "配置当前用户的 Codex MCP 服务。" },
    { id: "claude-code" as const, title: "Claude Code", description: "配置当前用户的 Claude Code MCP 服务。" }
  ];
  const packageEntries = [
    { id: "codex" as const, title: "Codex 插件包", description: "包含 Codex manifest、MCP 配置与 Iterlay Skill。" },
    { id: "claude-code" as const, title: "Claude Code 插件包", description: "包含 Claude Code manifest、MCP 配置与 Iterlay Skill。" }
  ];
  return (
    <>
      <DialogTitle className="sr-only">Coding Agent</DialogTitle>
      <DialogDescription className="sr-only">{uiText("将 Iterlay 连接到本机的 Coding Agent。")}</DialogDescription>
      <div className="flex w-full flex-col gap-8 px-6 py-7">
        <div className="max-w-[62ch]">
          <h2 className="text-sm font-semibold text-foreground">{uiText("连接 Coding Agent")}</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {uiText("配置后，Coding Agent 可以通过 MCP 在 Iterlay 中打开并预填创作任务。配置仅写入当前用户的本地设置，不会覆盖其他 MCP 服务。")}</p>
        </div>
        <SettingsGroup title={uiText("MCP 集成")}>
          {entries.map((entry) => {
            const client = clients.find((item) => item.id === entry.id);
            const settingUp = action === `setup:${entry.id}`;
            const removing = action === `remove:${entry.id}`;
            const processing = settingUp || removing;
            const setupComplete = Boolean(client?.configured && client?.skillInstalled);
            const hasIntegration = Boolean(client?.configured || client?.skillInstalled);
            const statusLabel = step?.client === entry.id ? step.label : undefined;
            return (
              <SettingsRow
                key={entry.id}
                title={entry.title}
                description={client?.configured ? uiText("MCP 已配置 · {{ui:0}}", [client.configPath]) : entry.description}
                control={
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={setupComplete ? "outline" : "default"}
                      className="min-w-[104px] transition-colors duration-200 motion-reduce:transition-none"
                      disabled={disabled || Boolean(action)}
                      onClick={() => void onSetup(entry.id)}
                    >
                      {settingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : setupComplete ? <Check className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
                      {settingUp ? uiText("处理中") : setupComplete ? uiText("已连接") : uiText("配置并安装")}
                    </Button>
                    {hasIntegration ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="transition-colors duration-200 motion-reduce:transition-none"
                        disabled={disabled || Boolean(action)}
                        aria-label={uiText("移除 {{ui:0}} 集成", [entry.title])}
                        title={uiText("移除 {{ui:0}} 集成", [entry.title])}
                        onClick={() => setRemovalTarget(entry)}
                      >
                        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    ) : null}
                  </div>
                }
              >
                <IntegrationDetail client={client} processing={processing} statusLabel={statusLabel} />
              </SettingsRow>
            );
          })}
          <SettingsRow
            title={uiText("终端命令")}
            description={uiText("也可以在终端运行一条命令完成同样的连接。")}
            stackControlOnNarrow
            control={
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={uiText("复制终端安装命令")}
                title={uiText("复制终端安装命令")}
                onClick={() => {
                  void navigator.clipboard.writeText("npx iterlay add");
                  setCommandCopied(true);
                  window.setTimeout(() => setCommandCopied(false), 1500);
                }}
              >
                {commandCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            }
          >
            <code className="block w-fit rounded bg-muted px-2 py-1 font-mono text-xs leading-5 text-foreground">npx iterlay add</code>
          </SettingsRow>
        </SettingsGroup>
        <PiAgentLogPanel />
        {error ? <p className="text-xs leading-5 text-destructive" role="alert">{error}</p> : null}
        <p className="text-xs leading-5 text-muted-foreground">{uiText("完成后请重新启动对应的 Coding Agent，使其加载新的 MCP 配置。")}</p>
        <SettingsGroup title={uiText("插件包")} className="max-[520px]:w-[calc(100vw-136px)]">
          {packageEntries.map((entry) => {
            const exporting = pluginPackageAction === entry.id;
            const resultPath = pluginPackagePaths[entry.id] ?? null;
            return (
              <SettingsRow
                key={entry.id}
                title={entry.title}
                description={entry.description}
                stackControlOnNarrow
                control={
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || Boolean(pluginPackageAction)}
                      onClick={() => void onExportPluginPackage(entry.id)}
                    >
                      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {exporting ? uiText("导出中") : uiText("导出 ZIP")}
                    </Button>
                    {resultPath ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={uiText("在文件夹中显示 {{ui:0}}", [entry.title])}
                        title={uiText("在文件夹中显示 {{ui:0}}", [entry.title])}
                        onClick={() => onOpenPluginPackage(resultPath)}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                }
              >
                {resultPath ? (
                  <p className="w-full min-w-0 truncate text-xs leading-5 text-muted-foreground" title={resultPath}>
                    {uiText("已导出 · ")}{resultPath}
                  </p>
                ) : null}
              </SettingsRow>
            );
          })}
        </SettingsGroup>
        {pluginPackageError ? <p className="text-xs leading-5 text-destructive" role="alert">{pluginPackageError}</p> : null}
      </div>
      <RemoveMcpIntegrationDialog
        entry={removalTarget}
        busy={Boolean(action)}
        onOpenChange={(open) => !open && setRemovalTarget(null)}
        onConfirm={() => {
          if (!removalTarget) return;
          void onRemove(removalTarget.id).finally(() => setRemovalTarget(null));
        }}
      />
      <CodexExamplesDialog open={codexExamplesOpen} onOpenChange={onCodexExamplesOpenChange} />
    </>
  );
}

function IntegrationDetail({
  client,
  processing,
  statusLabel
}: {
  client: {
    configured: boolean;
    skillInstalled: boolean;
    skillPath: string;
  } | undefined;
  processing: boolean;
  statusLabel?: string;
}): React.ReactElement | null {
  const uiText = useUiText();

  if (processing) {
    return (
      <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {statusLabel ?? "正在处理集成"}
      </p>
    );
  }
  if (!client?.skillInstalled) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
      {uiText("Skill 已安装 · ")}{client.skillPath}
    </p>
  );
}

function RemoveMcpIntegrationDialog({
  entry,
  busy,
  onOpenChange,
  onConfirm
}: {
  entry: { id: "codex" | "claude-code"; title: string } | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-base">{uiText("移除 ")}{entry?.title} {uiText("集成？")}</DialogTitle>
          <DialogDescription className="pt-1 text-xs leading-5">
            {uiText("将一并移除 Iterlay 的 MCP 配置和 Skill，不会影响你的其他配置或 Skill。移除后不会再自动安装，可随时重新连接恢复。")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {uiText("取消")}</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {busy ? uiText("移除中") : uiText("移除集成")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CodexExamplesDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const examples = [
    {
      id: "board",
      title: "新建创作画板",
      description: "创建一张夏日饮品海报的视觉画板",
      prompt: "使用 Iterlay MCP：先读取 iterlay-workspace Skill，再创建一个「夏日饮品海报」画板，按清爽、明亮、适合社媒投放的方向生成 4 张 1:1 灵感图。"
    },
    {
      id: "assets",
      title: "整理一张素材",
      description: "从素材库出发，生成电商主图方案",
      prompt: "使用 Iterlay MCP：先读取 iterlay-workspace Skill，然后打开素材库，选择一张产品图，为它生成 3 个更简洁的电商主图方向，并说明每个方向的视觉重点。"
    },
    {
      id: "template",
      title: "从模板开始",
      description: "创建秋季新品的极简视觉探索",
      prompt: "使用 Iterlay MCP：先读取 iterlay-workspace Skill，再创建一个「秋季新品」画板，以极简编辑风格生成 4 张不同构图的灵感图。"
    }
  ];

  async function openExample(id: string, prompt: string): Promise<void> {
    setOpeningId(id);
    setError(null);
    try {
      await getImageWorkbenchApi().openCodexPrompt(prompt);
    } catch (openError) {
      setError(getWorkbenchErrorMessage(openError, "无法打开 Codex。请确认已安装最新版 Codex 桌面应用。"));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-base">{uiText("Codex 已连接")}</DialogTitle>
          <DialogDescription className="pt-1 text-xs leading-5">
            {uiText("选择一个任务即可通过 Codex URL scheme 新建线程，并预填任务说明。")}</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border">
          {examples.map((example) => (
            <div key={example.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{example.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{example.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={Boolean(openingId)}
                onClick={() => void openExample(example.id, example.prompt)}
              >
                {openingId === example.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {uiText("在 Codex 中打开")}</Button>
            </div>
          ))}
        </div>
        {error ? <p className="border-t border-border px-5 py-3 text-xs leading-5 text-destructive" role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
