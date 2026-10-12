import { Copy, Pencil, Play } from "lucide-react";
import type { PromptSpec } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface PromptWorkbenchProps {
  prompt: string;
  promptSpec?: PromptSpec;
  onCopyPrompt: () => void;
  onReuse: () => void;
  onSendToEdit?: () => void;
}

/** PromptSpec field key → Chinese display label. */
const SPEC_LABELS: Record<string, string> = {
  primaryRequest: "主体请求",
  subject: "主体",
  styleMedium: "风格",
  sceneBackdrop: "场景",
  compositionFraming: "构图",
  lightingMood: "光线",
  colorPalette: "色彩",
  materialsTextures: "材质",
  verbatimText: "文字",
  constraints: "约束",
  avoid: "避免"
};

/** Fields to display from PromptSpec (in order). */
const SPEC_KEYS = Object.keys(SPEC_LABELS) as (keyof PromptSpec)[];

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}

export function PromptWorkbench({
  prompt,
  promptSpec,
  onCopyPrompt,
  onReuse,
  onSendToEdit
}: PromptWorkbenchProps): React.ReactElement {
  // Collect non-empty spec fields.
  const specChips: Array<{ key: string; label: string; value: string }> = [];
  if (promptSpec) {
    for (const key of SPEC_KEYS) {
      const value = promptSpec[key]?.trim();
      if (value) {
        specChips.push({ key, label: SPEC_LABELS[key] ?? key, value });
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Structured prompt spec chips */}
      {specChips.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap gap-1.5">
            {specChips.map((chip) => (
              <Tooltip key={chip.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(chip.value)}
                    className="group inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium text-muted-foreground">{chip.label}</span>
                    <span className="max-w-[140px] truncate text-foreground">{chip.value}</span>
                    <Copy className="ml-0.5 h-3 w-3 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{chip.value}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">点击复制</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}

      {/* Raw prompt text */}
      {prompt ? (
        <div className="max-h-32 overflow-y-auto rounded-lg bg-muted/30 p-2.5">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {prompt}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">该素材没有记录提示词。</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          disabled={!prompt}
          onClick={onCopyPrompt}
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          disabled={!prompt}
          onClick={onReuse}
        >
          <Play className="h-3.5 w-3.5" />
          以此生成
        </Button>
        {onSendToEdit && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={onSendToEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            送去编辑
          </Button>
        )}
      </div>
    </div>
  );
}
