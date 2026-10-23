import "./assistant-details.css";
import { useUiText } from "@/i18n";
import { useState } from "react";
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
  const uiText = useUiText();

  const running = calls.some((call) => call.status === "running");
  const failed = calls.some((call) => call.status === "error");
  const cancelled = calls.some((call) => call.status === "cancelled");
  const labels = { running: "运行中", completed: "已完成", error: "失败", cancelled: "已停止" };
  const toolLabel = (name: string): string => ({
    finish_assistant_result: "整理创作结果",
    create_board: "创建画板",
    generate_image: "生成图片",
    generate_video: "生成视频",
  }[name] ?? name.replace(/[_-]+/gu, " "));
  return <details className="assistant-tool-group">
    <summary>{running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : failed ? <TriangleAlert /> : <Check />}
      <span>{calls.length} {uiText("项工具调用")}</span>
      <span className={failed ? "text-destructive" : ""}>{running ? uiText("运行中") : failed ? uiText("部分失败") : cancelled ? uiText("已停止") : uiText("已完成")}</span><ChevronDown />
    </summary>
    <div className="assistant-tool-list">{calls.map((call) => <details key={call.id} className={`assistant-tool assistant-tool--${call.status}`}>
      <summary><span className="assistant-tool-icon"><Wrench /></span><span className="assistant-tool-name">{uiText(toolLabel(call.name))}</span><span className="assistant-tool-status">{uiText(labels[call.status])}</span><ChevronDown /></summary>
      <div className="assistant-tool-content">
        {call.input ? <><h4>{uiText("输入参数")}</h4><pre>{call.input}</pre></> : null}
        {call.output ? <><h4>{call.status === "error" ? uiText("错误详情") : uiText("输出结果")}</h4><pre>{call.output}</pre></> : null}
        {!call.input && !call.output ? <p>{uiText("此工具未提供可显示的详情。")}</p> : null}
      </div>
    </details>)}</div>
  </details>;
}

/** Provider-exposed reasoning and execution updates stay separate from the answer. */
export function AssistantProcessDetails({ reasoningSummary, activitySteps, streaming }: {
  reasoningSummary?: string;
  activitySteps?: string[];
  streaming?: boolean;
}): React.ReactElement | null {
  const uiText = useUiText();
  const steps = activitySteps?.filter((step, index) => step.trim() && step !== activitySteps[index - 1]) ?? [];
  if (!reasoningSummary?.trim() && !steps.length) return null;
  return <div className="assistant-process" data-assistant-process="">
    {reasoningSummary?.trim() ? <details className="assistant-process-section assistant-process-reasoning">
      <summary><Brain size={14} /><span>{uiText("思考摘要")}</span><ChevronDown size={14} /></summary>
      <div className="assistant-process-body">{reasoningSummary}</div>
    </details> : null}
    {steps.length ? <details className="assistant-process-section assistant-process-activity">
      <summary>{streaming ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" /> : <Check size={14} />}<span>{uiText("执行过程")}</span><ChevronDown size={14} /></summary>
      <ol className="assistant-process-body">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    </details> : null}
  </div>;
}
