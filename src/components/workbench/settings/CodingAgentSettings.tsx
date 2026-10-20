import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CodeXml, Copy, Download, Loader2, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { useUiText } from "@/i18n";
import type { CodingAgentId, CodingAgentIntegrationStatus } from "@shared/agent-integration";
import { SettingsGroup, SettingsPageHeader, SettingsRow } from "./SettingsPrimitives";
import { CliDefaultBoardSettings } from "./CliDefaultBoardSettings";
import { AgentStarterGuide } from "./AgentStarterGuide";
import "./coding-agent-settings.css";

const STEPS = [
  { title: "准备环境", description: "CLI 与模型服务" },
  { title: "安装 Skill", description: "选择你的 Coding Agent" },
  { title: "开始使用", description: "检查、生成与交付" }
] as const;
type SetupStep = 0 | 1 | 2;

export function CodingAgentSettings({ disabled, providerReady, onOpenModels, onImportBoard, onOpenBoards }: {
  disabled: boolean;
  providerReady: boolean;
  onOpenModels: () => void;
  onImportBoard?: () => void;
  onOpenBoards?: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  const stepId = useId();
  const [status, setStatus] = useState<CodingAgentIntegrationStatus | null>(null);
  const [selectedStep, setSelectedStep] = useState<SetupStep | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [defaultAgent, setDefaultAgent] = useState<CodingAgentId | null>(null);

  useEffect(() => {
    if (disabled) return;
    let disposed = false;
    const api = getImageWorkbenchApi();
    void Promise.all([api.getCodingAgentStatus(), api.getSettings()])
      .then(([result, settings]) => { if (!disposed) {
        setStatus(result);
        setDefaultAgent(settings.defaultCodingAgent ?? result.clients.find((agent) => agent.skillInstalled)?.id ?? "codex");
      } })
      .catch((e) => { if (!disposed) setError(getWorkbenchErrorMessage(e, "无法检测 Coding Agent，请重试。")); });
    return () => { disposed = true; };
  }, [disabled]);

  async function changeDefaultAgent(agent: CodingAgentId): Promise<void> {
    setBusy("default-agent");
    setError(null);
    setNotice(null);
    try {
      await getImageWorkbenchApi().updateSettings({ defaultCodingAgent: agent });
      setDefaultAgent(agent);
      setNotice(uiText("默认 Coding Agent 已保存"));
    } catch (cause) { setError(getWorkbenchErrorMessage(cause, uiText("无法保存默认 Coding Agent，请重试。"))); }
    finally { setBusy(null); }
  }

  async function perform(key: string, action: () => Promise<CodingAgentIntegrationStatus>): Promise<void> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      setStatus(next);
      if (next.cli.error) setError(next.cli.error);
      else if (key.startsWith("install:")) {
        setNotice(uiText("Skill 已安装，新开 Agent 会话后即可使用。"));
        setSelectedStep(2);
      }
      window.dispatchEvent(new Event("iterlay:agent-status-changed"));
    } catch (e) {
      setError(getWorkbenchErrorMessage(e, "操作未完成，请重试。"));
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, key: string): Promise<void> {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setError(uiText("复制失败，请手动选择并复制文本。")); }
  }

  const locked = disabled || Boolean(busy);
  const cliReady = Boolean(status?.cli.installed && !status.cli.error);
  const installedAgents = status?.clients.filter((agent) => agent.skillInstalled && !agent.legacyConfigured) ?? [];
  const environmentReady = cliReady && providerReady;
  const completed = [environmentReady, installedAgents.length > 0, false];
  const activeStep = selectedStep ?? (!environmentReady ? 0 : installedAgents.length ? 2 : 1);
  const selectStep = (step: SetupStep) => {
    setSelectedStep(step);
    setError(null);
    setNotice(null);
  };

  return <div className="coding-agent-settings" data-testid="coding-agent-settings">
    <SettingsPageHeader title="Coding Agent" description={uiText("在你习惯的编程工具里使用 Iterlay。")}/>
    <div className="coding-agent-body">
    <SettingsGroup title={uiText("默认 Coding Agent")}>
      <SettingsRow title={uiText("接收修改建议")}
        description={uiText("评论面板的 AI 按钮会打开此 Agent，并带入评论建议、图片版本和画板上下文。")}
        stackControlOnNarrow control={<select
          aria-label={uiText("默认 Coding Agent")}
          value={defaultAgent ?? "codex"}
          disabled={locked || defaultAgent === null}
          onChange={(event) => {
            const agent = event.target.value;
            if (agent === "codex" || agent === "claude-code") void changeDefaultAgent(agent);
          }}
          className="h-9 w-44 max-w-full rounded-md border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="codex">Codex</option>
          <option value="claude-code">Claude Code</option>
        </select>}
      />
      <p className="coding-agent-note">{uiText("Codex 会预填新对话草稿；Claude Code 会在 macOS 终端中打开，先与你确认修改方案。")}</p>
    </SettingsGroup>
    <nav className="coding-agent-steps" aria-label={uiText("配置步骤")}>
      <ol>
        {STEPS.map((step, index) => <li key={step.title} data-active={activeStep === index} data-complete={completed[index]}>
          <button
            type="button"
            aria-current={activeStep === index ? "step" : undefined}
            aria-controls={`${stepId}-panel`}
            disabled={locked}
            onClick={() => selectStep(index as SetupStep)}
          >
            <span className="coding-agent-step-number" aria-hidden="true">{completed[index] ? <Check /> : index + 1}</span>
            <span className="coding-agent-step-label"><strong>{uiText(step.title)}</strong><span>{uiText(step.description)}</span>{completed[index] ? <span className="sr-only">{uiText("已完成")}</span> : null}</span>
          </button>
        </li>)}
      </ol>
    </nav>

    <section className="coding-agent-step-panel" id={`${stepId}-panel`} aria-label={uiText(STEPS[activeStep].title)}>
      {activeStep === 0 ? <>
        <div className="coding-agent-panel-heading"><h3>{uiText("准备好创作环境")}</h3><p>{uiText("CLI 随 App 提供，模型与授权共用已有设置。")}</p></div>
        <div className="coding-agent-setup-row">
          <div className="coding-agent-avatar" aria-hidden="true"><Terminal className="size-5" /></div>
          <div className="coding-agent-info">
            <div className="coding-agent-name"><strong>Iterlay CLI</strong><Badge variant="secondary">{uiText(cliReady ? "已安装" : status ? "待安装" : "检测中")}</Badge></div>
            <p>{uiText(cliReady ? status?.cli.pathConfigured ? "新开终端即可使用，也可直接使用下方完整路径。" : "启动器已安装，PATH 还需配置。可先使用完整路径。" : "随 App 提供，无需单独安装 Node.js 或 npm。")}</p>
          </div>
          <Button variant="outline" size="sm" disabled={locked || !status} onClick={() => void perform("cli", () => getImageWorkbenchApi().installCli())}>
            {busy === "cli" ? <Loader2 className="animate-spin" /> : cliReady ? <RefreshCw /> : <Download />}{uiText(cliReady ? "检查与修复" : "安装 CLI")}
          </Button>
        </div>
        <div className="coding-agent-setup-row">
          <div className="coding-agent-avatar" aria-hidden="true"><CodeXml className="size-5" /></div>
          <div className="coding-agent-info"><div className="coding-agent-name"><strong>{uiText("图片服务")}</strong><Badge variant="outline">{uiText(providerReady ? "已配置" : "待配置")}</Badge></div><p>{uiText(providerReady ? "已保存模型与授权；可在模型设置中测试服务。" : "配置一次，App、CLI 和 Coding Agent 都能使用。")}</p></div>
          <Button variant="outline" size="sm" disabled={locked} onClick={onOpenModels}>{uiText(providerReady ? "管理模型" : "配置图片服务")}</Button>
        </div>
        {status?.development ? <p className="coding-agent-note">{uiText("开发工作区：安装与 Skill 配置仅写入测试目录。")}</p> : null}
      </> : activeStep === 1 ? <>
        <div className="coding-agent-panel-heading coding-agent-section-heading"><div><h3>{uiText("选择你的 Coding Agent")}</h3><p>{uiText("安装一个即可开始，也可以同时配置多个。")}</p></div><Button variant="ghost" size="sm" disabled={locked} onClick={() => void perform("refresh", () => getImageWorkbenchApi().getCodingAgentStatus())}>{busy === "refresh" ? <Loader2 className="animate-spin" /> : <RefreshCw />}{uiText("重新检测")}</Button></div>
        {!status && !error ? <div className="coding-agent-loading"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : null}
        {status?.clients.map((agent) => {
          const title = agent.id === "codex" ? "Codex" : "Claude Code";
          const installing = busy === `install:${agent.id}`;
          const migrated = agent.legacyConfigured;
          const installed = agent.skillInstalled && !migrated;
          const description = installed ? "已安装 iterlay-workspace 和 using-iterlay，新开会话后可手动调用。" : migrated ? "发现旧版本集成，一键迁移为 CLI Skill。" : agent.detected ? "已找到本机应用，安装 Skill 即可开始。" : agent.detection === "config-only" ? "发现配置，尚未确认程序安装；也可先安装 Skill。" : "暂未检测到程序，也可先安装 Skill，稍后使用。";
          return <div className="coding-agent-setup-row" key={agent.id}>
            <div className="coding-agent-avatar" aria-hidden="true">{agent.id === "codex" ? <Terminal className="size-5" /> : <CodeXml className="size-5" />}</div>
            <div className="coding-agent-info"><div className="coding-agent-name"><strong>{title}</strong><Badge variant="outline">{uiText(installed ? "Skill 已安装" : agent.detected ? "已检测到" : "待配置")}</Badge></div><p>{uiText(description)}</p></div>
            {installed ? <Button variant="outline" size="sm" disabled={locked} onClick={() => selectStep(2)}><ArrowRight />{uiText("开始使用")}</Button> : <Button size="sm" disabled={locked} onClick={() => void perform(`install:${agent.id}`, () => getImageWorkbenchApi().installAgentSkill(agent.id))}>{installing ? <Loader2 className="animate-spin" /> : <Download />}{uiText(installing ? "正在安装" : migrated ? "迁移并安装" : "安装 Skill")}</Button>}
          </div>;
        })}
      </> : <>
        <div className="coding-agent-panel-heading"><h3>{uiText("从准备检查，到第一份交付")}</h3><p>{uiText("新开 Agent 会话，选择一项任务。安装 Skill 不代表该会话已加载它。")}</p><p>{uiText("Codex 使用 $using-iterlay；Claude Code 使用 /using-iterlay。此入口仅在手动调用时启用。")}</p></div>
        {installedAgents.length ? <div className="coding-agent-ready"><CheckCircle2 className="size-4" aria-hidden="true" /><span>{installedAgents.map((agent) => agent.id === "codex" ? "Codex" : "Claude Code").join(" / ")} · {uiText("Skill 已安装")}</span></div> : <p className="coding-agent-guidance">{uiText("先完成 Skill 安装，再在新会话中尝试。")}</p>}
        {!providerReady ? <div className="coding-agent-provider"><p>{uiText("还没有可用的图片服务。配置后即可开始生成。")}</p><Button variant="outline" size="sm" disabled={locked} onClick={onOpenModels}>{uiText("配置图片服务")}</Button></div> : null}
        <AgentStarterGuide disabled={locked} defaultAgent={defaultAgent ?? installedAgents[0]?.id ?? "codex"} onCopy={copy} copied={copied} onImportBoard={onImportBoard} onOpenBoards={onOpenBoards} />
        <p className="coding-agent-command-label">{uiText("也可以直接在终端运行")}</p>
        <div className="coding-agent-command"><code>iterlay providers list --json</code><Button variant="ghost" size="icon" aria-label={uiText("复制终端命令")} onClick={() => void copy("iterlay providers list --json", "command")}>{copied === "command" ? <Check /> : <Copy />}</Button></div>
      </>}

      {notice ? <p className="coding-agent-feedback" role="status"><CheckCircle2 className="size-4" aria-hidden="true" />{notice}</p> : null}
      {error ? <div className="coding-agent-error" role="alert"><p>{error}</p>{!status ? <Button variant="outline" size="sm" disabled={locked} onClick={() => void perform("refresh", () => getImageWorkbenchApi().getCodingAgentStatus())}>{uiText("重新检测")}</Button> : null}</div> : null}
      <footer className="coding-agent-step-footer">
        {activeStep > 0 ? <Button variant="ghost" size="sm" disabled={locked} onClick={() => selectStep((activeStep - 1) as SetupStep)}><ArrowLeft />{uiText("上一步")}</Button> : <span className="coding-agent-step-footnote">{uiText("可随时切换步骤")}</span>}
        {activeStep < 2 ? <Button size="sm" disabled={locked || !status} onClick={() => selectStep((activeStep + 1) as SetupStep)}>{uiText(activeStep === 0 ? "下一步：安装 Skill" : "下一步：开始使用")}<ArrowRight /></Button> : <Button variant="outline" size="sm" disabled={locked} onClick={() => selectStep(1)}>{uiText("配置其他 Agent")}</Button>}
      </footer>
    </section>

    <CliDefaultBoardSettings disabled={disabled} />

    <details className="coding-agent-details"><summary>{uiText("命令、安装位置与维护")}</summary><div className="coding-agent-detail-content">
      <p>{uiText("CLI 与 Skill 共用 App 的模型配置；安装 Skill 不会发起生成请求。")}</p>
      {status?.cli.path ? <div><strong>{uiText("CLI 位置")}</strong><code>{status.cli.path}</code><Button size="sm" variant="outline" onClick={() => void copy(status.cli.path, "path")}>{uiText(copied === "path" ? "已复制" : "复制路径")}</Button></div> : null}
      {status?.clients.map((agent) => <div key={agent.id}><strong>{agent.id === "codex" ? "Codex" : "Claude Code"}</strong><code>{agent.skillPath}</code><div className="coding-agent-detail-actions"><Button size="sm" variant="outline" disabled={locked} onClick={() => void perform(`install:${agent.id}`, () => getImageWorkbenchApi().installAgentSkill(agent.id))}>{uiText("重新安装 Skill")}</Button>{agent.skillInstalled && agent.skillManaged ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => { if (window.confirm(uiText("移除此 Agent 的 Iterlay Skill？之后不会再自动安装，可随时重新安装。"))) void perform(`remove:${agent.id}`, () => getImageWorkbenchApi().removeAgentSkill(agent.id)); }}><Trash2 />{uiText("移除 Skill")}</Button> : null}</div></div>)}
    </div></details>
    </div>
  </div>;
}
