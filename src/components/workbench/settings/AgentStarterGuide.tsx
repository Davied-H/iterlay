import { useId, useState } from "react";
import { ArrowUpRight, Check, Copy, FolderOpen, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiLocale, useUiText } from "@/i18n";
import type { CodingAgentId } from "@shared/agent-integration";
import { AGENT_STARTER, buildAgentStarterPrompt, type AgentStarterMode } from "@shared/agent-starter";

const TASKS = [
  { id: "check", title: "检查准备情况", description: "只读检查，不调用模型。", copy: "复制检查任务" },
  { id: "create", title: "生成第一张图", description: "确认模型与费用后，生成并导出 1 张主图。", copy: "复制生成任务" },
  { id: "deliver", title: "导出示例素材", description: "使用已有结果交付 3 张网站素材，不重新生成。", copy: "复制导出任务" }
] as const;

export function AgentStarterGuide({ disabled, defaultAgent, onCopy, copied, onImportBoard, onOpenBoards }: {
  disabled: boolean;
  defaultAgent: CodingAgentId;
  onCopy: (value: string, key: string) => Promise<void>;
  copied: string | null;
  onImportBoard?: () => void;
  onOpenBoards?: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  const locale = useUiLocale();
  const [selectedAgent, setSelectedAgent] = useState<CodingAgentId | null>(null);
  const [mode, setMode] = useState<AgentStarterMode>("check");
  const id = useId();
  const agent = selectedAgent ?? defaultAgent;
  const language = locale === "en-US" ? "en" : "zh";
  const prompt = buildAgentStarterPrompt(agent, language, mode);
  const task = TASKS.find((item) => item.id === mode)!;
  const copyKey = `starter:${agent}:${language}:${mode}`;
  const site = `https://davied-h.github.io/iterlay/`;

  return <div className="agent-starter-guide">
    <div className="agent-starter-agent" role="group" aria-label={uiText("任务使用的 Agent")}>
      {(["codex", "claude-code"] as const).map((value) => <Button type="button" key={value} size="sm" variant={agent === value ? "secondary" : "ghost"} disabled={disabled} aria-pressed={agent === value} onClick={() => setSelectedAgent(value)}>{value === "codex" ? "Codex" : "Claude Code"}</Button>)}
    </div>
    <div className="agent-starter-tasks" role="group" aria-label={uiText("首次交付任务")}>
      {TASKS.map((item) => <button type="button" key={item.id} disabled={disabled} aria-pressed={mode === item.id} aria-controls={`${id}-task`} onClick={() => setMode(item.id)}><strong>{uiText(item.title)}</strong><span>{uiText(item.description)}</span></button>)}
    </div>
    <section id={`${id}-task`} className="agent-starter-task" aria-label={uiText(task.title)}>
      {mode === "check" ? <p>{uiText("在新会话中执行这项只读任务，确认 App 和配置是否可读取。已保存配置不代表模型服务已实测可用。")}</p> : mode === "create" ? <p>{uiText("任务会先说明 Provider、模型和张数，等你确认后才生成。成功后返回画板、任务编号和导出路径；失败时沿用原任务检查，不重复生成。")}</p> : <div className="agent-starter-import">
        <p>{uiText("先下载并导入 FIELD 画板包，通过画板左上的示例章节定位源图、改色、场景和海报，再导出三个交付结果。导入与浏览不会调用模型。")}</p>
        <div className="agent-starter-links"><a href={`${site}${AGENT_STARTER.archivePath}`} target="_blank" rel="noreferrer">{uiText("下载 FIELD 画板包")}<ArrowUpRight aria-hidden="true" /></a>{onImportBoard ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onImportBoard}><Import />{uiText("导入已下载的画板包")}</Button> : null}</div>
      </div>}
      <div className="agent-starter-prompt-actions"><Button type="button" size="sm" disabled={disabled} aria-label={uiText(task.copy)} onClick={() => void onCopy(prompt, copyKey)}>{copied === copyKey ? <Check /> : <Copy />}{uiText(copied === copyKey ? "已复制" : task.copy)}</Button><span className="agent-starter-invocation">{agent === "codex" ? "$using-iterlay" : "/using-iterlay"}</span></div>
      <details className="agent-starter-prompt"><summary>{uiText("查看完整任务")}</summary><pre>{prompt}</pre></details>
    </section>
    <div className="agent-starter-handoff"><div><strong>{uiText("拿到结果后，回到画板检查")}</strong><p>{uiText("按 Agent 返回的画板名称打开结果，比较并选择版本。导出文件保存在项目的 public/iterlay-starter 目录，已有文件不会覆盖。")}</p></div>{onOpenBoards ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onOpenBoards}><FolderOpen />{uiText("查看画板与结果")}</Button> : null}</div>
    <a className="agent-starter-case-link" href={`${site}#/agents?lang=${language}`} target="_blank" rel="noreferrer">{uiText("查看完整案例与交付步骤")}<ArrowUpRight aria-hidden="true" /></a>
  </div>;
}
