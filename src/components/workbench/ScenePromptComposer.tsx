import { useUiText } from "@/i18n";
import { useState, type ClipboardEvent, type DragEvent } from "react";
import { Loader2, Paperclip, Send, Settings2, X } from "lucide-react";
import type { ReferenceImagePayload } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { isSendEnter } from "@/lib/send-on-enter";
import { cn } from "@/lib/utils";

export interface ScenePromptComposerReference {
  payload: Pick<ReferenceImagePayload, "id" | "name">;
  previewUrl: string;
}

interface ScenePromptComposerProps {
  value: string;
  placeholder: string;
  references: ScenePromptComposerReference[];
  referenceLimit: number;
  canOptimize: boolean;
  composing: boolean;
  hasGeneratedPrompt: boolean;
  referencesUnsupported: boolean;
  onValueChange: (value: string) => void;
  onAddReferences: (files: File[]) => void;
  onRemoveReference: (id: string) => void;
  onOpenSettings: () => void;
  onSubmit: () => void;
}

export function ScenePromptComposer({
  value,
  placeholder,
  references,
  referenceLimit,
  canOptimize,
  composing,
  hasGeneratedPrompt,
  referencesUnsupported,
  onValueChange,
  onAddReferences,
  onRemoveReference,
  onOpenSettings,
  onSubmit
}: ScenePromptComposerProps): React.ReactElement {
  const uiText = useUiText();

  const [dragActive, setDragActive] = useState(false);
  const atReferenceLimit = references.length >= referenceLimit;
  const submitLabel = hasGeneratedPrompt ? "更新 AI 助手" : "发送给 AI 助手";
  const submitDisabled = (!value.trim() && references.length === 0) || !canOptimize || composing;

  function addDroppedImages(event: DragEvent<HTMLDivElement>): void {
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    onAddReferences(files);
  }

  function addPastedImages(event: ClipboardEvent<HTMLDivElement>): void {
    const files = extractClipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    onAddReferences(files);
  }

  return (
    <div
      data-scene-prompt-composer=""
      className={cn(
        "mt-3 rounded-xl border border-[#dededa] bg-[#f8f8f6] p-2 transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-[#747470] focus-within:ring-2 focus-within:ring-[#747470]/20 dark:border-border dark:bg-card dark:focus-within:border-ring dark:focus-within:ring-ring/20",
        dragActive && "border-foreground/50 bg-muted/60 ring-2 ring-ring/20"
      )}
      onPaste={addPastedImages}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={addDroppedImages}
    >
      {references.length > 0 ? (
        <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1 pt-1">
          {references.map((image) => (
            <div
              key={image.payload.id}
              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
              title={image.payload.name}
            >
              <img src={image.previewUrl} alt={image.payload.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={uiText("移除参考图 {{ui:0}}", [image.payload.name])}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRemoveReference(image.payload.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        aria-label={uiText("本次生成需求")}
        value={value}
        rows={3}
        placeholder={placeholder}
        className="block min-h-20 max-h-40 w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-sm leading-6 text-[#242422] outline-none placeholder:text-[#686865] dark:text-foreground dark:placeholder:text-muted-foreground"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (!isSendEnter(event)) return;
          event.preventDefault();
          if (!submitDisabled) onSubmit();
        }}
      />

      {referencesUnsupported ? (
        <button
          type="button"
          className="mx-1 mb-1 text-left text-[11px] leading-5 text-amber-700 hover:underline dark:text-amber-400"
          onClick={onOpenSettings}
        >
          {uiText("当前图像 Provider 不支持参考图，切换后可生成实例。")}</button>
      ) : null}

      <div className="flex h-8 min-w-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={cn(
                "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#686865] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#e8e8e4] hover:text-[#242422] active:scale-[0.94] focus-within:ring-2 focus-within:ring-ring motion-reduce:transform-none motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground",
                atReferenceLimit && "pointer-events-none opacity-40"
              )}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={atReferenceLimit}
                className="sr-only"
                onChange={(event) => {
                  onAddReferences(Array.from(event.target.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">{uiText("添加参考图")}</span>
            </label>
          </TooltipTrigger>
          <TooltipContent side="top">
            {atReferenceLimit ? uiText("已添加 {{ui:0}} 张参考图", [referenceLimit]) : uiText("添加参考图，最多 {{ui:0}} 张", [referenceLimit])}
          </TooltipContent>
        </Tooltip>

        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground max-[640px]:hidden">
          {uiText("参考图 ")}{references.length}/{referenceLimit}
        </span>

        {!canOptimize ? (
          <>
            <button
              type="button"
              className="ml-auto truncate text-xs font-medium text-muted-foreground hover:text-foreground max-[640px]:hidden"
              onClick={onOpenSettings}
            >
              {uiText("配置 AI Provider")}</button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto hidden h-8 w-8 shrink-0 rounded-lg text-muted-foreground max-[640px]:flex"
                  aria-label={uiText("配置 AI Provider")}
                  onClick={onOpenSettings}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{uiText("配置 AI Provider")}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <span className="ml-auto hidden truncate text-[11px] text-muted-foreground min-[420px]:inline">{uiText("Enter 发送 · Shift+Enter 换行")}</span>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="group ml-1 h-8 w-8 shrink-0 rounded-full bg-[#30302e] text-[#f4f4f1] transition-[background-color,transform] duration-150 ease-out hover:scale-[1.04] hover:bg-[#242422] active:scale-[0.94] focus-visible:ring-[#747470]/50 motion-reduce:transform-none motion-reduce:transition-none dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90 dark:focus-visible:ring-ring/50"
              aria-label={composing ? uiText("正在生成提示词") : submitLabel}
              disabled={submitDisabled}
              onClick={onSubmit}
            >
              {composing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-px group-hover:-translate-y-px motion-reduce:transform-none motion-reduce:transition-none" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{composing ? uiText("正在生成提示词") : submitLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
