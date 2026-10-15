import { useUiText } from "@/i18n";
import { useState } from "react";
import { Check, ChevronDown, Loader2, Wrench, TriangleAlert } from "lucide-react";
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
  return <details className="assistant-tool-group">
    <summary>{running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : failed ? <TriangleAlert /> : <Check />}
      <span>{calls.length} {uiText("项工具调用")}</span>
      <span className={failed ? "text-destructive" : ""}>{running ? uiText("运行中") : failed ? uiText("部分失败") : cancelled ? uiText("已停止") : uiText("已完成")}</span><ChevronDown />
    </summary>
    <div className="assistant-tool-list">{calls.map((call) => <details key={call.id} className="assistant-tool">
      <summary><Wrench /><span className="min-w-0 flex-1 break-all font-mono">{call.name}</span><span className={call.status === "error" ? "text-destructive" : "text-muted-foreground"}>{labels[call.status]}</span><ChevronDown /></summary>
      <div className="assistant-tool-content">
        {call.input ? <><h4>{uiText("输入参数")}</h4><pre>{call.input}</pre></> : null}
        {call.output ? <><h4>{call.status === "error" ? uiText("错误详情") : uiText("输出结果")}</h4><pre>{call.output}</pre></> : null}
        {!call.input && !call.output ? <p>{uiText("此工具未提供可显示的详情。")}</p> : null}
      </div>
    </details>)}</div>
  </details>;
}
