import { useUiText } from "@/i18n";
import { memo, useEffect, useMemo, useState } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { Check, CircleAlert, Clapperboard, LoaderCircle, Lock, Plus, ScrollText, UserRound } from "lucide-react";
import type { ComicCharacterFields, ComicDramaBoardNode, ComicSegmentScriptFields, ComicSettingFields } from "@shared/comic-drama";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ComicDramaNodeData {
  node: ComicDramaBoardNode;
  onChange?: (nodeId: string, patch: Partial<ComicDramaBoardNode>) => void;
  editRequest?: number;
  connectionRevision?: string;
  onContinueComicDrama?: (nodeId: string) => void;
  onRetryCharacter?: (node: Extract<ComicDramaBoardNode, { type: "comic-character" }>) => void;
  onConnectionHandlePointerDown?: (
    nodeId: string,
    side: "left" | "right",
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
  connectionSnapTargetHandle?: string;
}

const STATUS_LABELS = {
  draft: "草稿",
  generating: "生成中",
  review: "待采用",
  adopted: "已采用",
  failed: "失败",
  saved: "已保存",
  ready: "可继续制作",
  stale: "上下文有更新",
  blocked: "输入缺失"
} as const;

function activeVersion(node: ComicDramaBoardNode): ComicDramaBoardNode["versions"][number] {
  return (node.versions.find((version) => version.versionId === node.activeVersionId) ?? node.versions[0]) as ComicDramaBoardNode["versions"][number];
}

function ComicDramaNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const uiText = useUiText();

  const {
  node,
  editRequest,
  connectionRevision,
  onChange,
  onContinueComicDrama,
  onRetryCharacter,
  onConnectionHandlePointerDown,
  connectionSnapTargetHandle
} = data as unknown as ComicDramaNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateNodeInternals(node.id));
    return () => window.cancelAnimationFrame(frame);
  }, [connectionRevision, node.id, updateNodeInternals]);
  useEffect(() => { if (editRequest) setEditing(true); }, [editRequest]);
  const version = activeVersion(node);
  const versionNumber = Math.max(1, node.versions.findIndex((item) => item.versionId === node.activeVersionId) + 1);
  const typeLabel = node.type === "comic-setting" ? "漫剧设定" : node.type === "comic-character" ? "角色卡" : "片段脚本";
  const title = node.type === "comic-setting"
    ? (version.fields as ComicSettingFields).title || "尚未完善故事设定"
    : node.type === "comic-character"
      ? node.name
      : `片段 ${String(node.order).padStart(2, "0")} · ${node.title}`;
  const statusLabel = STATUS_LABELS[node.status];
  const footerMeta = node.type === "comic-setting"
    ? `v${versionNumber} · ${(version.fields as ComicSettingFields).aspectRatio} · ${(version.fields as ComicSettingFields).targetDurationSeconds} 秒`
    : node.type === "comic-character"
      ? `v${versionNumber} · ${(version.fields as ComicCharacterFields).appearanceAnchors.length} 个外观锚点`
      : `v${versionNumber} · ${(version.fields as ComicSegmentScriptFields).durationSeconds} 秒`;

  return (
    <>
      <article
        role="group"
        aria-label={uiText("{{ui:0}}，{{ui:1}}，版本 {{ui:2}}，{{ui:3}}", [typeLabel, title, versionNumber, statusLabel])}
        data-comic-drama-node={node.type}
        data-comic-drama-status={node.status}
        data-connection-snap-target={connectionSnapTargetHandle}
        className={cn(
          "canvas-node-card canvas-workflow-node comic-drama-node group relative flex cursor-grab flex-col overflow-visible active:cursor-grabbing",
          selected && "canvas-workflow-node--selected"
        )}
      >
        <Handle type="target" position={Position.Left} id="target-left" aria-label={uiText("{{ui:0}}输入", [typeLabel])} className="image-node-connection-handle image-node-connection-handle--target nodrag nopan" />
        <Handle type="source" position={Position.Right} id="source-right" aria-label={uiText("{{ui:0}}输出", [typeLabel])} className="image-node-connection-handle image-node-connection-handle--source nodrag nopan" />
        <Handle type="source" position={Position.Right} id="system-output" className="canvas-programmatic-handle" />
        <button
          type="button"
          tabIndex={-1}
          aria-label={uiText("从{{ui:0}}创建连接", [typeLabel])}
          className="nodrag nopan image-node-connection-trigger comic-drama-node__connection-trigger"
          onPointerDown={(event) => onConnectionHandlePointerDown?.(node.id, "right", event)}
        >
          <Plus aria-hidden />
        </button>

        <header className="canvas-workflow-node__header comic-drama-node__header">
          <span className="canvas-workflow-node__icon comic-drama-node__icon" aria-hidden>
            {node.type === "comic-setting" ? <Clapperboard /> : node.type === "comic-character" ? <UserRound /> : <ScrollText />}
          </span>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild><span tabIndex={0} className="canvas-workflow-node__title comic-drama-node__title">{title}</span></TooltipTrigger>
              <TooltipContent side="top" className="max-w-80 whitespace-pre-wrap break-words">{typeLabel} · {title}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className={cn(
            "canvas-generation-status comic-drama-node__header-status",
            ["blocked", "stale", "failed"].includes(node.status) && "comic-drama-node__header-status--error",
            ["saved", "ready"].includes(node.status) && "comic-drama-node__header-status--saved",
            node.status === "adopted" && "comic-drama-node__header-status--adopted"
          )} data-status={node.status}>
            {node.status === "blocked" || node.status === "stale" || node.status === "failed"
              ? <CircleAlert aria-hidden />
              : node.status === "generating"
                ? <LoaderCircle aria-hidden className="comic-drama-node__status-spinner" />
                : ["saved", "ready", "adopted"].includes(node.status)
                  ? <Check aria-hidden />
                  : null}
            {statusLabel}
          </span>
        </header>

        <div className="nodrag comic-drama-node__body" onPointerDown={(event) => event.stopPropagation()}>
          {node.type === "comic-setting" ? <SettingSummary fields={version.fields as ComicSettingFields} /> : null}
          {node.type === "comic-character" ? <CharacterSummary fields={version.fields as ComicCharacterFields} status={node.status} generationError={node.generationError} /> : null}
          {node.type === "comic-segment-script" ? <SegmentSummary fields={version.fields as ComicSegmentScriptFields} /> : null}
        </div>

        <footer className="nodrag comic-drama-node__footer" onPointerDown={(event) => event.stopPropagation()}>
          <span className="comic-drama-node__footer-meta">{footerMeta}</span>
          {node.type === "comic-setting" ? <button type="button" className="canvas-generation-run comic-drama-node__primary-action" onClick={() => onContinueComicDrama?.(node.id)}>{uiText("继续制作")}</button> : null}
          {node.type === "comic-character" && node.status === "failed" ? <button type="button" className="canvas-generation-run comic-drama-node__primary-action" title={node.generationError} onClick={() => onRetryCharacter?.(node)}>{uiText("逐项重试")}</button> : null}
          {node.type === "comic-character" && ["draft", "saved", "ready"].includes(node.status) ? <button type="button" className="canvas-generation-run comic-drama-node__primary-action" onClick={() => onRetryCharacter?.(node)}>{uiText("生成形象")}</button> : null}
          {node.type === "comic-character" && node.status === "review" ? <button type="button" className="canvas-generation-run comic-drama-node__primary-action" onClick={() => onChange?.(node.id, { status: "adopted" })}>{uiText("采用角色")}</button> : null}
          <Button type="button" variant="ghost" size="sm" className="comic-drama-node__edit-action" onClick={() => setEditing(true)}>
            {uiText("编辑")}{node.type === "comic-setting" ? uiText("设定") : node.type === "comic-character" ? uiText("角色") : uiText("脚本")}
          </Button>
        </footer>
      </article>
      <ComicNodeEditor node={node} open={editing} onOpenChange={setEditing} onChange={onChange} />
    </>
  );
}

function SettingSummary({ fields }: { fields: ComicSettingFields }): React.ReactElement {
  const uiText = useUiText();

  return <>
    <span className="comic-drama-node__section-label">{uiText("故事简介")}</span>
    <p className="comic-drama-node__synopsis">{fields.synopsis || "还没有填写故事内容，点击“编辑设定”补充。"}</p>
    <div className="comic-drama-node__chips">{[fields.genre, fields.tone].filter(Boolean).map((value) => <span key={value}>{value}</span>)}</div>
  </>;
}

function CharacterSummary({ fields, status, generationError }: {
  fields: ComicCharacterFields;
  status: ComicDramaBoardNode["status"];
  generationError?: string;
}): React.ReactElement {
  const uiText = useUiText();

  return <>
    <div className="comic-drama-node__character-empty" role="status" data-error={status === "failed" ? "true" : undefined}>
      <span>{status === "generating" ? uiText("角色形象生成中") : status === "review" ? uiText("角色形象待采用") : status === "adopted" ? uiText("角色形象已采用") : status === "failed" ? uiText("角色形象生成失败") : uiText("尚未采用角色形象")}</span>
      {status === "failed" ? <small title={generationError}>{generationError || "未返回具体原因，请逐项重试。"}</small> : null}
    </div>
    <div className="comic-drama-node__details">
      <p className="comic-drama-node__role">{fields.role || "待确定角色定位"}</p>
      <p className="comic-drama-node__anchors">{fields.appearanceAnchors.slice(0, 2).join(" · ") || "尚未设置外观锚点"}</p>
    </div>
  </>;
}

function SegmentSummary({ fields }: { fields: ComicSegmentScriptFields }): React.ReactElement {
  const uiText = useUiText();

  return <>
    <span className="comic-drama-node__section-label">{uiText("片段内容")}</span>
    <p className="comic-drama-node__purpose">{fields.purpose || "尚未填写剧情目的"}</p>
    <p className="comic-drama-node__script">{fields.action || "尚未填写动作"}{fields.dialogue ? `\n“${fields.dialogue}”` : ""}</p>
    <p className="comic-drama-node__meta"><Lock aria-label={uiText("结构化脚本字段")} /> {fields.emotion || "情绪待定"}</p>
  </>;
}

function ComicNodeEditor({ node, open, onOpenChange, onChange }: {
  node: ComicDramaBoardNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange?: ComicDramaNodeData["onChange"];
}): React.ReactElement {
  const uiText = useUiText();

  const initialFields = useMemo(() => structuredClone(activeVersion(node).fields), [node]);
  const [draft, setDraft] = useState<Record<string, unknown>>(initialFields as unknown as Record<string, unknown>);
  const [name, setName] = useState(node.type === "comic-character" ? node.name : node.type === "comic-segment-script" ? node.title : "");

  function save(): void {
    const previous = activeVersion(node);
    const nextVersion = { ...previous, versionId: crypto.randomUUID(), createdAt: new Date().toISOString(), fields: draft };
    const identityPatch = node.type === "comic-character" ? { name: name.trim() || node.name }
      : node.type === "comic-segment-script" ? { title: name.trim() || node.title } : {};
    onChange?.(node.id, {
      ...identityPatch,
      status: "saved",
      versions: [...node.versions, nextVersion] as ComicDramaBoardNode["versions"],
      activeVersionId: nextVersion.versionId
    } as Partial<ComicDramaBoardNode>);
    onOpenChange(false);
  }

  const fields = node.type === "comic-setting"
    ? [["title", "剧名"], ["synopsis", "梗概"], ["genre", "题材"], ["tone", "基调"], ["visualStyle", "视觉风格"], ["aspectRatio", "画幅"], ["targetDurationSeconds", "目标时长（秒）"]]
    : node.type === "comic-character"
      ? [["role", "角色定位"], ["profile", "人物设定"], ["appearanceAnchors", "外观锚点（每行一项）"], ["visualPrompt", "视觉提示词"]]
      : [["purpose", "剧情目的"], ["scene", "场景"], ["action", "动作"], ["dialogue", "对白"], ["emotion", "情绪"], ["visualDirection", "视觉方向"], ["cameraDirection", "镜头方向"], ["durationSeconds", "时长（秒）"]];

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (next) {
        setDraft(structuredClone(activeVersion(node).fields) as unknown as Record<string, unknown>);
        setName(node.type === "comic-character" ? node.name : node.type === "comic-segment-script" ? node.title : "");
      }
      onOpenChange(next);
    }}>
      <DialogContent className="max-h-[calc(100vh-48px)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{uiText("编辑")}{node.type === "comic-setting" ? uiText("漫剧设定") : node.type === "comic-character" ? uiText("角色卡") : uiText("片段脚本")}</DialogTitle>
          <DialogDescription>{uiText("保存会创建新的稳定版本，旧版本继续保留。")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          {node.type !== "comic-setting" ? <EditorField label={node.type === "comic-character" ? uiText("角色名") : uiText("片段标题")} value={name} onChange={setName} /> : null}
          {fields.map(([key, label]) => {
            const value = draft[key];
            const multiline = ["synopsis", "profile", "visualPrompt", "action", "dialogue", "visualDirection", "cameraDirection", "appearanceAnchors"].includes(key);
            return <EditorField
              key={key}
              label={label}
              multiline={multiline}
              value={Array.isArray(value) ? value.join("\n") : String(value ?? "")}
              onChange={(next) => setDraft((current) => ({
                ...current,
                [key]: Array.isArray(value) ? next.split("\n").map((item) => item.trim()).filter(Boolean)
                  : key.endsWith("Seconds") ? Math.max(1, Number(next) || 1) : next
              }))}
            />;
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{uiText("放弃修改")}</Button>
          <Button type="button" onClick={save}>{uiText("保存新版本")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorField({ label, value, multiline = false, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }): React.ReactElement {
  const controlClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return <label className="grid gap-1.5 text-xs font-medium">
    {label}
    {multiline
      ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className={cn(controlClass, "min-h-20 resize-y break-words")} />
      : <input value={value} onChange={(event) => onChange(event.target.value)} className={controlClass} />}
  </label>;
}

export const ComicDramaNode = memo(ComicDramaNodeComponent);
