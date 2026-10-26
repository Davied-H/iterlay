import "./assistant-details.css";
import { useUiText } from "@/i18n";
import { useState } from "react";
import { ChainOfThought, ChainOfThoughtHeader, ChainOfThoughtContent, ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought";
import { Brain, Check, ChevronDown, Loader2, Wrench, TriangleAlert } from "lucide-react";
import type { AssistantAttachmentSnapshot, AssistantToolCall } from "@shared/assistant-display";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";

export function AssistantMessageAttachments({ attachments }: { attachments: AssistantAttachmentSnapshot[] }): React.ReactElement {
  const uiText = useUiText();

  const [preview, setPreview] = useState<AssistantAttachmentSnapshot | null>(null);
  return <>
    <div className="assistant-sent-images" aria-label={uiText("本轮发送的图片")}>
      {attachments.map((image) => <button type="button" key={image.id} disabled={!image.src} onClick={() => setPreview(image)} title={image.name} aria-label={uiText("查看已发送图片 {{ui:0}}", [image.name])}>
        {image.src ? <img src={image.src} alt={image.name} loading="lazy" /> : <span>{uiText("图片不可用")}</span>}
        <span>{image.role === "edit-target" ? uiText("编辑目标 · ") : ""}{image.name}</span>
      </button>)}
    </div>
    {preview ? <ImageZoomLightbox src={preview.src} alt={preview.name} onClose={() => setPreview(null)} /> : null}
  </>;
}

export function AssistantToolGroup({ calls }: { calls: AssistantToolCall[] }): React.ReactElement {
  return <AssistantProcessDetails calls={calls} />;
}

/** Display only provider-exposed summaries, execution updates and tool details. */
export function AssistantProcessDetails({ reasoningSummary, activitySteps, streaming, calls = [], statusLabel }: {
  reasoningSummary?: string;
  activitySteps?: string[];
  streaming?: boolean;
  calls?: AssistantToolCall[];
  statusLabel?: string;
}): React.ReactElement {
  const uiText = useUiText();
  // Generic transport/preparation updates are status, not a useful execution trace.
  const isBoilerplate = (step: string): boolean => /^(正在)?(整理输入|理解你的需求|连接文本模型|连接模型|分析你的需求|分析需求|准备下一步|检查回复内容|保存回复)$/u.test(step.trim().replace(/[.…]+$/u, ""));
  const steps = activitySteps?.filter((step, index) => step.trim() && !isBoilerplate(step) && step !== activitySteps[index - 1]) ?? [];
  const running = Boolean(streaming || calls.some((call) => call.status === "running"));
  const failed = calls.some((call) => call.status === "error");
  const cancelled = calls.some((call) => call.status === "cancelled");
  const labels = { running: "运行中", completed: "已完成", error: "失败", cancelled: "已停止" };
  const toolLabel = (name: string): string => ({
    finish_assistant_result: "整理创作结果", create_board: "创建画板",
    generate_image: "生成图片", generate_video: "生成视频",
    read: "读取资料", read_board: "读取画板", present_form: "收集创作信息",
  }[name] ?? name.replace(/[_-]+/gu, " "));
  const completedLabel = (step: string): string => step.replace(/[.…]+$/u, "").replace(/^正在/u, "").trim();
  const activeTool = calls.findLast((call) => call.status === "running");
  const hasDetails = Boolean(reasoningSummary?.trim() || steps.length || calls.length);
  const title = running ? activeTool ? uiText(toolLabel(activeTool.name)) : statusLabel && !isBoilerplate(statusLabel) ? uiText(statusLabel) : uiText("正在思考…")
    : failed ? uiText("部分失败") : cancelled ? uiText("已停止") : uiText("已完成");
  if (!hasDetails && !running) return <></>;
  if (!hasDetails) return <div className="assistant-process assistant-chain assistant-chain-status" role="status" data-assistant-process="">
    <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /><span>{title}</span>
  </div>;
  return <ChainOfThought className="assistant-process assistant-chain" data-assistant-process="">
    <ChainOfThoughtHeader className="assistant-chain-trigger" aria-label={[title, calls.length ? `${calls.length} ${uiText("项工具调用")}` : ""].filter(Boolean).join(" · ")} icon={running ? Loader2 : failed ? TriangleAlert : cancelled ? Wrench : Check}>
      <span className="assistant-chain-heading">
        <span className={failed ? "text-destructive" : ""} role={running ? "status" : undefined}>{title}</span>
        {calls.length ? <span>{calls.length} {uiText("项工具调用")}</span> : null}
      </span>
    </ChainOfThoughtHeader>
    <ChainOfThoughtContent className="assistant-chain-content">
      {reasoningSummary?.trim() ? <ChainOfThoughtStep className="assistant-process-reasoning" icon={Brain} label={uiText("思考过程")}>
        <div className="assistant-chain-text">{reasoningSummary}</div>
      </ChainOfThoughtStep> : null}
      {steps.map((step, index) => <ChainOfThoughtStep className="assistant-process-activity" key={`activity-${index}`} icon={Check}
        label={<span className="assistant-chain-heading"><span>{completedLabel(step)}</span><span>{uiText("已记录")}</span></span>} />)}
      {calls.map((call) => <details key={call.id} className={`assistant-tool assistant-tool--${call.status}`}>
        <summary>
          {call.status === "running" ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : call.status === "error" ? <TriangleAlert size={14} /> : <Check size={14} />}
          <span className="assistant-tool-name">{uiText(toolLabel(call.name))}</span>
          <span className={call.status === "error" ? "text-destructive" : "assistant-tool-status"}>{uiText(labels[call.status])}</span>
          <ChevronDown size={14} />
        </summary>
        <div className="assistant-tool-content">
          {call.input ? <><h4>{uiText("输入参数")}</h4><pre>{call.input}</pre></> : null}
          {call.output ? <><h4>{uiText(call.status === "error" ? "错误详情" : "输出结果")}</h4><pre>{call.output}</pre></> : null}
          {!call.input && !call.output ? <p>{uiText("此工具未提供可显示的详情。")}</p> : null}
        </div>
      </details>)}
    </ChainOfThoughtContent>
  </ChainOfThought>;
}
