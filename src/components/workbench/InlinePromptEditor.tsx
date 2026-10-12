import { forwardRef, useEffect, useRef, useState } from "react";
import { FilePenLine, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractCanvasClipboardItems, type CanvasClipboardItem } from "@/components/canvas/canvas-clipboard";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import {
  composeStructuredPromptLines,
  hasStructuredPromptFields,
  parseStructuredPromptLines,
  type StructuredPromptLine
} from "@/lib/structured-prompt";
import { cn } from "@/lib/utils";

export {
  composeStructuredPromptLines,
  hasStructuredPromptFields,
  parseStructuredPromptLines
} from "@/lib/structured-prompt";
export type { StructuredPromptLine } from "@/lib/structured-prompt";

interface TextSegment {
  type: "text";
  value: string;
}

interface VariableSegment {
  type: "variable";
  label: string;
  index: number;
}

export type InlinePromptSegment = TextSegment | VariableSegment;

export interface InlinePromptLine {
  label: string;
  segments: InlinePromptSegment[];
}

interface InlinePromptEditorProps {
  prompt: string;
  templatePrompts: string[];
  height: number;
  dragging: boolean;
  reduceMotion: boolean;
  placeholder: string;
  onChange: (prompt: string) => void;
  onFocus: () => void;
  onSubmitKey: (event: React.KeyboardEvent<HTMLElement>) => void;
  onPasteCanvasItems?: (items: CanvasClipboardItem[]) => void;
  onPasteImages?: (files: File[]) => void;
  onExpandedChange?: (open: boolean) => void;
}

const INLINE_VARIABLE_PATTERN = "【([^】]+)】";

export function parseInlinePrompt(source: string): InlinePromptSegment[] {
  const segments: InlinePromptSegment[] = [];
  let cursor = 0;
  let variableIndex = 0;

  for (const match of source.matchAll(new RegExp(INLINE_VARIABLE_PATTERN, "g"))) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ type: "text", value: source.slice(cursor, index) });
    segments.push({ type: "variable", label: match[1], index: variableIndex });
    variableIndex += 1;
    cursor = index + match[0].length;
  }

  if (cursor < source.length) segments.push({ type: "text", value: source.slice(cursor) });
  return segments;
}

export function hasInlinePromptVariables(source: string): boolean {
  return new RegExp(INLINE_VARIABLE_PATTERN).test(source);
}

export function parseInlinePromptLines(source: string): InlinePromptLine[] {
  let variableOffset = 0;
  return source.split("\n").map((line) => {
    const separatorIndex = line.indexOf("：");
    const label = separatorIndex >= 0 ? line.slice(0, separatorIndex) : "";
    const content = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : line;
    const segments = parseInlinePrompt(content).map((segment) =>
      segment.type === "variable" ? { ...segment, index: segment.index + variableOffset } : segment
    );
    variableOffset += segments.filter((segment) => segment.type === "variable").length;
    return { label, segments };
  });
}

export function composeInlinePrompt(source: string, values: string[]): string {
  let index = 0;
  return source.replace(new RegExp(INLINE_VARIABLE_PATTERN, "g"), (_match, label: string) => {
    const value = values[index]?.trim();
    index += 1;
    return value || `【${label}】`;
  });
}

function shouldUseStructuredEditor(source: string, templatePrompts: string[]): boolean {
  return (
    hasStructuredPromptFields(source) ||
    (source.includes("\n") && templatePrompts.includes(source))
  );
}

export const InlinePromptEditor = forwardRef<HTMLDivElement, InlinePromptEditorProps>(function InlinePromptEditor(
  {
    prompt,
    templatePrompts,
    height,
    dragging,
    reduceMotion,
    placeholder,
    onChange,
    onFocus,
    onSubmitKey,
    onPasteCanvasItems,
    onPasteImages,
    onExpandedChange
  },
  ref
) {
  const [structuredPrompt, setStructuredPrompt] = useState<string | null>(() =>
    shouldUseStructuredEditor(prompt, templatePrompts) ? prompt : null
  );
  const [plainPrompt, setPlainPrompt] = useState(prompt);
  const pendingPlainPromptRef = useRef<string | null>(null);
  const externalPromptRef = useRef(prompt);
  const plainInputRef = useRef<HTMLTextAreaElement>(null);
  const lines = structuredPrompt === null ? [] : parseStructuredPromptLines(structuredPrompt);
  const currentPrompt = structuredPrompt ?? plainPrompt;

  useEffect(() => {
    const pendingPrompt = pendingPlainPromptRef.current;
    if (pendingPrompt !== null) {
      if (pendingPrompt === prompt) {
        pendingPlainPromptRef.current = null;
        externalPromptRef.current = prompt;
        return;
      }
      if (prompt === externalPromptRef.current) return;
      pendingPlainPromptRef.current = null;
    }
    if (prompt === externalPromptRef.current) return;

    externalPromptRef.current = prompt;
    setStructuredPrompt(shouldUseStructuredEditor(prompt, templatePrompts) ? prompt : null);
    setPlainPrompt(prompt);
  }, [prompt, templatePrompts]);

  function updateStructuredLine(index: number, patch: Partial<Pick<StructuredPromptLine, "label" | "content">>): void {
    if (structuredPrompt === null) return;
    const nextLines = parseStructuredPromptLines(structuredPrompt).map((line, currentIndex) =>
      currentIndex === index ? { ...line, ...patch } : line
    );
    const next = composeStructuredPromptLines(nextLines);
    pendingPlainPromptRef.current = next;
    setStructuredPrompt(next);
    onChange(next);
  }

  function switchToPlainText(): void {
    setPlainPrompt(structuredPrompt ?? prompt);
    setStructuredPrompt(null);
  }

  function clearPrompt(): void {
    setStructuredPrompt(null);
    setPlainPrompt("");
    pendingPlainPromptRef.current = "";
    onChange("");
    window.requestAnimationFrame(() => plainInputRef.current?.focus());
  }

  const editorClassName = cn(
    "h-full w-full min-h-0 overflow-y-auto border-0 bg-transparent px-2 pb-1.5 pt-0.5 text-sm leading-6 shadow-none"
  );

  return (
    <div
      ref={ref}
      className={cn(
        "relative",
        !dragging && !reduceMotion && "transition-[height] duration-300 ease-out"
      )}
      style={{ height }}
      data-prompt-editor=""
      onPaste={(event) => {
        const canvasItems = onPasteCanvasItems ? extractCanvasClipboardItems(event.clipboardData) : null;
        if (canvasItems) {
          event.preventDefault();
          onPasteCanvasItems?.(canvasItems);
          return;
        }
        if (!onPasteImages) return;
        const files = extractClipboardImageFiles(event.clipboardData);
        if (files.length === 0) return;
        event.preventDefault();
        onPasteImages(files);
      }}
    >
      {structuredPrompt !== null ? (
        <div
          className={cn(editorClassName, "space-y-1 pr-[4.5rem]")}
          role="group"
          aria-label="结构化提示词编辑"
          tabIndex={-1}
          onFocus={onFocus}
          onKeyDown={onSubmitKey}
        >
          {lines.map((line, lineIndex) => (
            <div
              key={`line:${lineIndex}`}
              className={cn(
                "min-w-0 items-start gap-x-2",
                line.separator ? "grid grid-cols-[6.5rem_minmax(0,1fr)]" : "flex"
              )}
            >
              {line.separator ? (
                <input
                  type="text"
                  value={line.label}
                  onChange={(event) => updateStructuredLine(lineIndex, { label: event.target.value })}
                  onFocus={onFocus}
                  onKeyDown={onSubmitKey}
                  aria-label={`编辑第 ${lineIndex + 1} 行字段名`}
                  data-structured-field-label={lineIndex}
                  className="h-7 w-full min-w-0 rounded px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring/25"
                />
              ) : null}
              <StructuredFieldInput
                lineIndex={lineIndex}
                label={line.label || `第 ${lineIndex + 1} 行`}
                value={line.content}
                onChange={(content) => updateStructuredLine(lineIndex, { content })}
                onFocus={onFocus}
                onKeyDown={onSubmitKey}
                onExpandedChange={onExpandedChange}
              />
            </div>
          ))}
        </div>
      ) : (
        <Textarea
          ref={plainInputRef}
          className={cn(editorClassName, "resize-none focus-visible:ring-0", plainPrompt && "pr-10")}
          value={plainPrompt}
          onFocus={onFocus}
          onChange={(event) => {
            pendingPlainPromptRef.current = event.target.value;
            setPlainPrompt(event.target.value);
            onChange(event.target.value);
          }}
          onKeyDown={onSubmitKey}
          placeholder={placeholder}
        />
      )}

      {currentPrompt ? (
        <TooltipProvider delayDuration={200}>
          <div className="absolute -top-3 right-1.5 flex items-center gap-0.5">
            {structuredPrompt !== null ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={switchToPlainText}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="切换为普通文本编辑"
                  >
                    <FilePenLine className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">切换为普通文本编辑</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={clearPrompt}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="清空提示词"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">清空提示词</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ) : null}
    </div>
  );
});

function StructuredFieldInput({
  lineIndex,
  label,
  value,
  onChange,
  onFocus,
  onKeyDown,
  onExpandedChange
}: {
  lineIndex: number;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onExpandedChange?: (open: boolean) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const expandedInputRef = useRef<HTMLTextAreaElement>(null);
  const placeholderOnly = /^【[^】]+】$/.test(value.trim());

  function changeOpen(next: boolean): void {
    setOpen(next);
    onExpandedChange?.(next);
    if (next) onFocus();
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <span className="inline-flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-transparent bg-transparent transition-colors hover:border-input hover:bg-muted/35 focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/20">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => {
            onFocus();
            if (placeholderOnly) {
              const input = event.currentTarget;
              window.requestAnimationFrame(() => input.select());
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={`填写${label}`}
          aria-label={`编辑${label}的内容`}
          data-structured-field-content={lineIndex}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent px-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground",
            placeholderOnly && "text-muted-foreground"
          )}
        />
        <DialogTrigger asChild>
          <button
            type="button"
            className="mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`放大编辑${label}`}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </DialogTrigger>
      </span>

      {/* 居中弹层：透明遮罩保持画布可见，完成按钮内嵌在文本域右下角。 */}
      <DialogContent
        hideClose
        aria-describedby={undefined}
        overlayClassName="bg-transparent backdrop-blur-none"
        className="max-w-lg gap-3 p-4"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => {
            const textarea = expandedInputRef.current;
            textarea?.focus();
            textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
          });
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="truncate text-sm font-medium">编辑{label}</DialogTitle>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Array.from(value).length}</span>
        </div>
        <div className="relative">
          <Textarea
            ref={expandedInputRef}
            data-structured-field-expanded={lineIndex}
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/\s*\r?\n\s*/g, " "))}
            onKeyDown={onKeyDown}
            placeholder={`填写${label}`}
            className="min-h-36 resize-none pb-12 text-sm leading-6 focus-visible:ring-0"
          />
          <Button size="sm" className="absolute bottom-2 right-2" onClick={() => changeOpen(false)}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
