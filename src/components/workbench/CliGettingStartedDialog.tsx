import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, ArrowUpRight, Check, CheckCircle2, ChevronRight, CodeXml, Copy, Download, FolderOpen, Info, LayoutGrid, Loader2, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiLocale, useUiText } from "@/i18n";
import { buildCliGuideCommands, resolveCliDestination } from "@/lib/cli-getting-started";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { buildAgentStarterPrompt } from "@shared/agent-starter";
import type { CodingAgentIntegrationStatus } from "@shared/agent-integration";
import type { BoardSummary } from "@shared/types";
import "./cli-getting-started.css";

type StarterAgent = "codex" | "claude-code";
interface Environment {
  status: CodingAgentIntegrationStatus;
  boards: BoardSummary[];
  defaultBoardId?: string;
  defaultAgent?: string;
  providerConfigured: boolean;
}

interface CliGettingStartedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: (section: "coding-agent" | "model-management") => void;
  onOpenBoard: (id: string) => void;
  onOpenBoards: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

function GuideStep({ number, title, children }: { number: number; title: string; children: ReactNode }): React.ReactElement {
  return <section className="cli-guide-step">
    <span className="cli-guide-number" aria-hidden="true">{number}</span>
    <div className="cli-guide-step-body"><h3>{title}</h3>{children}</div>
  </section>;
}

function CommandSnippet({ label, command, copied, onCopy }: {
  label: string; command: string; copied: boolean; onCopy: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  return <div className="cli-guide-command">
    <div className="cli-guide-command-bar"><span>{label}</span><Button type="button" variant="ghost" size="sm" aria-label={uiText("复制{{ui:0}}", [label])} onClick={onCopy}>
      {copied ? <Check /> : <Copy />}{uiText(copied ? "已复制" : "复制")}
    </Button></div>
    <pre><code>{command}</code></pre>
  </div>;
}

export function CliGettingStartedDialog({ open, onOpenChange, onOpenSettings, onOpenBoard, onOpenBoards, returnFocusRef }: CliGettingStartedDialogProps): React.ReactElement {
  const uiText = useUiText();
  const locale = useUiLocale();
  const [tab, setTab] = useState("terminal");
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<StarterAgent | null>(null);
  const [task, setTask] = useState<"check" | "create">("check");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const handoff = useRef(false);
  const mounted = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    handoff.current = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setCopied(null);
    void Promise.resolve().then(() => {
      const api = getImageWorkbenchApi();
      return Promise.all([api.getCodingAgentStatus(), api.getSettings(), api.listBoards()]);
    })
      .then(([status, settings, boards]) => {
        if (disposed) return;
        setEnvironment({ status, boards, defaultBoardId: settings.cliDefaultBoardId, defaultAgent: settings.defaultCodingAgent,
          providerConfigured: Boolean(settings.setupComplete && settings.providerKeyStatus[settings.activeProviderId]) });
      })
      .catch((cause) => { if (!disposed) setError(getWorkbenchErrorMessage(cause, "无法读取创作环境，请重新检测。")); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [open, loadAttempt]);

  const status = environment?.status;
  const cliReady = Boolean(status?.cli.installed && !status.cli.error);
  const pathReady = cliReady && Boolean(status?.cli.pathConfigured);
  const destination = resolveCliDestination(environment?.boards ?? [], environment?.defaultBoardId);
  const preferredAgent = environment?.defaultAgent;
  const installedStarter = status?.clients.find((item) => (item.id === "codex" || item.id === "claude-code") && item.skillInstalled)?.id;
  const agent: StarterAgent = selectedAgent ?? (preferredAgent === "codex" || preferredAgent === "claude-code" ? preferredAgent : installedStarter === "claude-code" ? "claude-code" : "codex");
  const client = status?.clients.find((item) => item.id === agent);
  const skillReady = Boolean(client?.skillInstalled && !client.legacyConfigured);
  const agentName = agent === "codex" ? "Codex" : "Claude Code";
  const commands = buildCliGuideCommands(status?.cli, locale === "en-US", status?.development);
  const prompt = buildAgentStarterPrompt(agent, locale === "en-US" ? "en" : "zh", task);
  const taskKey = `${agent}:${locale}:${task}`;

  async function install(kind: "cli" | StarterAgent): Promise<void> {
    setBusy(kind); setError(null); setNotice(null);
    try {
      const api = getImageWorkbenchApi();
      const next = kind === "cli" ? await api.installCli() : await api.installAgentSkill(kind);
      if (!mounted.current) return;
      setEnvironment((current) => current ? { ...current, status: next } : current);
      const installed = next.clients.find((item) => item.id === kind);
      if (next.cli.error) setError(getWorkbenchErrorMessage(next.cli.error));
      else if (kind !== "cli" && (!installed?.skillInstalled || installed.legacyConfigured)) setError(uiText("Skill 尚未安装完成，请重试或打开高级设置。"));
      else if (kind === "cli" && !next.cli.installed) setError(uiText("CLI 尚未安装完成，请重试。"));
      else setNotice(uiText(kind === "cli" ? "CLI 已安装，请新开终端使用。" : "Skill 已安装，新开 Agent 会话后即可使用。"));
      window.dispatchEvent(new Event("iterlay:agent-status-changed"));
    } catch (cause) {
      if (mounted.current) setError(getWorkbenchErrorMessage(cause, "安装未完成，请重试。"));
    } finally { if (mounted.current) setBusy(null); }
  }

  async function copy(value: string, key: string): Promise<void> {
    setError(null); setNotice(null);
    try {
      await navigator.clipboard.writeText(value);
      if (!mounted.current) return;
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopied(key);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      if (!mounted.current) return;
      if (key === taskKey) setShowPrompt(true);
      setError(uiText("复制失败，请手动选择并复制文本。"));
    }
  }

  function openSettings(section: "coding-agent" | "model-management"): void {
    handoff.current = true;
    onOpenChange(false);
    onOpenSettings(section);
  }

  function openResults(): void {
    handoff.current = true;
    onOpenChange(false);
    if (destination.board) onOpenBoard(destination.board.id);
    else onOpenBoards();
  }

  function changeTab(value: string): void {
    setTab(value); setShowCommands(false); setNotice(null);
    scrollRef.current?.scrollTo?.({ top: 0 });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="cli-guide flex w-[calc(100%-2rem)] max-w-[720px] flex-col gap-0 overflow-hidden border-0 p-0"
      overlayClassName="bg-black/25 dark:bg-black/55" onCloseAutoFocus={(event) => { event.preventDefault(); if (!handoff.current) returnFocusRef.current?.focus(); }}>
      <header className="cli-guide-heading">
        <div className="cli-guide-title"><span className="cli-guide-title-icon"><Terminal aria-hidden="true" /></span><DialogTitle>{uiText("用 CLI 开始创作")}</DialogTitle></div>
        <DialogDescription>{uiText("在终端或编程助手中创作，与画板保持同步。")}</DialogDescription>
      </header>
      <Tabs.Root value={tab} onValueChange={changeTab} className="cli-guide-tabs">
        <Tabs.List className="cli-guide-tablist" aria-label={uiText("使用方式")}>
          <Tabs.Trigger value="terminal"><Terminal aria-hidden="true" />{uiText("终端使用")}</Tabs.Trigger>
          <Tabs.Trigger value="agent"><CodeXml aria-hidden="true" />Coding Agent</Tabs.Trigger>
        </Tabs.List>
        <div className="cli-guide-scroll" ref={scrollRef}>
          <div className="cli-guide-environment" aria-live="polite" aria-busy={loading}>
            {loading ? <><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /><span className="cli-guide-meta">{uiText("正在检测环境…")}</span></> : environment ? <>
              <span data-ready={pathReady}>{pathReady ? <CheckCircle2 /> : <AlertCircle />}{uiText(!cliReady ? "CLI 待安装" : pathReady ? "CLI 已安装" : "命令路径待配置")}</span>
              <span data-ready={environment.providerConfigured}>{environment.providerConfigured ? <CheckCircle2 /> : <AlertCircle />}{uiText(environment.providerConfigured ? "图片服务已配置" : "图片服务待配置")}</span>
              <Button type="button" variant="ghost" className="cli-guide-link" onClick={() => openSettings(environment.providerConfigured ? "coding-agent" : "model-management")}>{uiText(environment.providerConfigured ? "管理配置" : "配置模型")}<ChevronRight /></Button>
            </> : <><span><AlertCircle />{uiText("环境检测未完成")}</span><Button type="button" variant="ghost" className="cli-guide-link" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{uiText("重新检测")}<RefreshCw /></Button></>}
          </div>
          {status && !pathReady ? <div className="cli-guide-setup">
            <div><strong>{uiText(cliReady ? "新开终端，或先使用完整路径" : "先安装随 App 提供的 CLI")}</strong><p>{uiText(cliReady ? "下方命令已使用启动器完整路径，可直接复制。" : "无需单独安装 Node.js 或 npm。安装不会提交生成任务。")}</p>
              {status.cli.error ? <p className="cli-guide-inline-error">{uiText(status.cli.error)}</p> : null}</div>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || loading} onClick={() => void install("cli")}>{busy === "cli" ? <Loader2 className="animate-spin" /> : cliReady ? <RefreshCw /> : <Download />}{uiText(cliReady ? "修复命令路径" : "安装 CLI")}</Button>
          </div> : null}
          <Tabs.Content value="terminal" className="cli-guide-panel">
            <GuideStep number={1} title={uiText("新开终端，检查连接")}>
              <p>{uiText("复制下面的命令，粘贴到你的终端运行。")}</p>
              <CommandSnippet label={uiText("检查连接命令")} command={commands.status} copied={copied === "status"} onCopy={() => void copy(commands.status, "status")} />
            </GuideStep>
            <GuideStep number={2} title={uiText("试着生成第一张图")}>
              <p>{uiText("用默认图片模型，生成一张极简咖啡杯插画。")}</p>
              <CommandSnippet label={uiText("图片生成命令")} command={commands.generate} copied={copied === "generate"} onCopy={() => void copy(commands.generate, "generate")} />
              <p className="cli-guide-hint">{uiText("运行后会生成 1 张图片，费用由你配置的模型服务收取。")}</p>
            </GuideStep>
            <GuideStep number={3} title={uiText("回到画板，继续创作")}>
              <p>{uiText("生成结果自动同步到画板，方便查看、编辑和比较。")}</p>
              {loading ? <Skeleton className="mt-3 h-10 w-full" /> : environment ? destination.missing ? <div className="cli-guide-missing"><AlertCircle /><div><strong>{uiText("默认画板已不可用")}</strong><p>{uiText("请先重新选择默认画板，再运行生成命令。")}</p></div><Button type="button" variant="ghost" className="cli-guide-link" onClick={() => openSettings("coding-agent")}>{uiText("重新选择")}</Button></div> : <div className="cli-guide-output">
                <span className="cli-guide-board-icon"><LayoutGrid aria-hidden="true" /></span><div><strong>{destination.board?.name ?? uiText("CLI 创作")}</strong><p>{uiText("同时导出至终端当前目录的 cup.png")}</p></div>
                <Button type="button" variant="ghost" className="cli-guide-link" onClick={openResults}>{uiText(destination.board ? "查看画板" : "前往画板库")}<ArrowUpRight /></Button>
              </div> : <Button type="button" variant="outline" size="sm" onClick={openResults}><FolderOpen />{uiText("前往画板库")}</Button>}
              {!loading && environment && !destination.missing && !destination.board ? <p className="cli-guide-hint">{uiText("第一次生成时会自动创建「CLI 创作」画板。")}</p> : null}
            </GuideStep>
          </Tabs.Content>
          <Tabs.Content value="agent" className="cli-guide-panel">
            <GuideStep number={1} title={uiText("选择你的编程助手")}>
              <p>{uiText("安装 using-iterlay Skill，让助手知道如何调用 CLI。")}</p>
              <div className="cli-guide-agents" role="group" aria-label={uiText("选择 Coding Agent")}>
                {(["codex", "claude-code"] as const).map((id) => <button type="button" key={id} disabled={Boolean(busy)} aria-pressed={agent === id} onClick={() => { setSelectedAgent(id); setShowPrompt(false); }}>
                  {id === "codex" ? <Terminal aria-hidden="true" /> : <CodeXml aria-hidden="true" />}<span>{id === "codex" ? "Codex" : "Claude Code"}</span><span className="cli-guide-radio" aria-hidden="true" />
                </button>)}
              </div>
              <div className="cli-guide-install-row"><span data-ready={skillReady}>{loading ? <Loader2 className="animate-spin" /> : skillReady ? <CheckCircle2 /> : <Info />}{uiText(loading ? "正在检测 Skill…" : skillReady ? "Skill 已安装" : "Skill 待安装")}</span>
                <Button type="button" variant={skillReady ? "ghost" : "outline"} className={skillReady ? "cli-guide-link" : undefined} size="sm" disabled={loading || !environment || Boolean(busy)} onClick={() => void install(agent)}>{busy === agent ? <Loader2 className="animate-spin" /> : null}{uiText(busy === agent ? "正在安装…" : client?.legacyConfigured ? "迁移并安装" : skillReady ? "重新安装" : "安装 Skill")}</Button>
              </div>
              {client && !client.detected ? <p className="cli-guide-hint">{uiText("暂未检测到此 Agent，也可以先安装 Skill。")}</p> : null}
            </GuideStep>
            <GuideStep number={2} title={uiText("新开一个 Agent 会话")}><p>{uiText("安装后新开会话，助手才能加载 Skill。已打开的会话可能还未加载。")}</p></GuideStep>
            <GuideStep number={3} title={uiText("把第一项任务交给它")}>
              <div className="cli-guide-task-options" role="group" aria-label={uiText("选择入门任务")}><button type="button" aria-pressed={task === "check"} onClick={() => setTask("check")}>{uiText("检查准备情况")}</button><button type="button" aria-pressed={task === "create"} onClick={() => setTask("create")}>{uiText("生成第一张图")}</button></div>
              <div className="cli-guide-prompt"><code>{agent === "codex" ? "$using-iterlay" : "/using-iterlay"}</code>
                <p>{uiText(task === "check" ? "检查 Iterlay 是否可连接、图片服务是否已配置，告诉我还需要做什么。先不生成图片。" : "帮我生成一张 FIELD 音箱网站主图。先说明模型、张数与费用，等我确认后再生成。")}</p>
                <div className="cli-guide-prompt-actions"><Button type="button" size="sm" onClick={() => void copy(prompt, taskKey)}>{copied === taskKey ? <Check /> : <Copy />}{uiText(copied === taskKey ? "已复制" : task === "check" ? "复制检查任务" : "复制生成任务")}</Button><span>{uiText(task === "check" ? "只读检查，不调用模型。" : "确认模型与费用后再生成。")}</span></div>
                <details open={showPrompt} onToggle={(event) => setShowPrompt(event.currentTarget.open)}><summary>{uiText("查看完整任务")}</summary><pre>{prompt}</pre></details>
              </div><p className="cli-guide-hint">{uiText("复制后粘贴到 {{ui:0}} 的新会话中发送。", [agentName])}</p>
            </GuideStep>
          </Tabs.Content>
          <details className="cli-guide-more" open={showCommands} onToggle={(event) => setShowCommands(event.currentTarget.open)}>
            <summary>{uiText("更多命令与使用说明")}<ChevronRight /></summary><div>
              <p>{uiText("日常使用无需先打开 App，CLI 会自动启动后台工作台。")}</p>
              <CommandSnippet label={uiText("完整帮助命令")} command={commands.help} copied={copied === "help"} onCopy={() => void copy(commands.help, "help")} />
              <CommandSnippet label={uiText("图片服务列表命令")} command={commands.providers} copied={copied === "providers"} onCopy={() => void copy(commands.providers, "providers")} />
              <p className="cli-guide-hint">{uiText("已保存配置不代表模型服务已实测可用；Skill 已安装也不代表当前会话已加载。")}</p>
            </div>
          </details>
          {status?.development ? <p className="cli-guide-development">{uiText("开发工作区：安装与 Skill 配置仅写入测试目录。")}</p> : null}
        </div>
      </Tabs.Root>
      {error ? <div className="cli-guide-feedback" role="alert"><AlertCircle /><p>{error}</p><Button type="button" variant="ghost" size="sm" disabled={loading || Boolean(busy)} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{uiText("重新检测")}</Button></div> : notice ? <div className="cli-guide-feedback" role="status"><CheckCircle2 /><p>{notice}</p></div> : null}
      <span className="sr-only" role="status" aria-live="polite">{copied ? uiText("已复制") : ""}</span>
      <footer className="cli-guide-footer"><div><Button type="button" variant="ghost" className="cli-guide-link" onClick={() => { setShowCommands(true); requestAnimationFrame(() => scrollRef.current?.querySelector(".cli-guide-more")?.scrollIntoView({ block: "nearest", behavior: "instant" })); }}>{uiText("使用指南")}<ArrowUpRight /></Button><Button type="button" variant="ghost" className="cli-guide-link" onClick={() => openSettings("coding-agent")}>{uiText("高级设置")}</Button></div><Button type="button" size="sm" onClick={() => onOpenChange(false)}>{uiText("知道了")}</Button></footer>
    </DialogContent>
  </Dialog>;
}
