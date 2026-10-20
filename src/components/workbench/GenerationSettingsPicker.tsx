import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useI18n, useUiText } from "@/i18n";
import { generationSettingsSummary, IMAGE_QUALITY_LABELS, providerUsesImageQuality } from "@/lib/generation-settings-summary";
import { getProviderImageSizeOptions, providerSupportsCustomImageSize } from "@/lib/provider-image-sizes";
import { providerSupportsTransparentBackground } from "@/lib/provider-transparent-background";
import { cn } from "@/lib/utils";
import type {
  GenerateImageInput,
  ProviderConfig
} from "@shared/types";
import { validateGptImageSize } from "@shared/workflow";
import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolbarTooltip } from "./PromptToolbar";

function parseSize(value: string): { w: string; h: string } {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value.trim());
  return match ? { w: match[1], h: match[2] } : { w: "", h: "" };
}

export function GenerationSettingsPicker({
  size,
  count,
  quality,
  model,
  workflowMode,
  transparentBackground,
  maxCount,
  provider,
  onSizeChange,
  onCountChange,
  onQualityChange,
  onTransparentBackgroundChange,
  onOpenChange
}: {
  size: string;
  count: number;
  quality: GenerateImageInput["quality"];
  model: string;
  workflowMode: GenerateImageInput["workflowMode"];
  transparentBackground: boolean;
  maxCount: number;
  provider?: ProviderConfig;
  onSizeChange: (size: string) => void;
  onCountChange: (count: number) => void;
  onQualityChange: (quality: NonNullable<GenerateImageInput["quality"]>) => void;
  onTransparentBackgroundChange: (enabled: boolean) => void;
  onOpenChange?: (open: boolean) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(() => parseSize(size).w);
  const [h, setH] = useState(() => parseSize(size).h);
  const availablePresets = getProviderImageSizeOptions(provider);
  const supportsCustomSize = providerSupportsCustomImageSize(provider);
  const supportsTransparentBackground = providerSupportsTransparentBackground(provider);
  const supportsQuality = providerUsesImageQuality(provider);
  const summary = generationSettingsSummary({ model, size, quality, n: count, workflowMode }, provider);
  const parameterSummary = `${uiText(summary.size)} · ${uiText(summary.quality)} · ${uiText("{{ui:0}} 张", [summary.count])}`;
  const summaryLabel = `${uiText(summary.model)} · ${parameterSummary}`;
  const validation = validateGptImageSize(Number(w), Number(h));
  const custom = `${w}x${h}`;
  const canApplyCustom = supportsCustomSize && validation.ok && custom !== size;

  useEffect(() => {
    const parsed = parseSize(size);
    setW(parsed.w);
    setH(parsed.h);
  }, [size]);

  function changeOpen(next: boolean): void {
    setOpen(next);
    onOpenChange?.(next);
  }

  function updateCount(next: number): void {
    onCountChange(Math.max(1, Math.min(maxCount, Math.trunc(next) || 1)));
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <ToolbarTooltip label={`${t("prompt.generationSettings")} · ${summaryLabel}`} disabled={open}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="prompt-fusion-settings h-8 min-w-0 max-w-full shrink gap-1.5 px-2 text-xs text-muted-foreground"
            aria-label={`${t("prompt.generationSettings")}：${summaryLabel}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="prompt-fusion-settings-model min-w-0 max-w-28 truncate" title={summary.model}>{uiText(summary.model)}</span>
            <span className="prompt-fusion-settings-parameters min-w-0 truncate tabular-nums">· {parameterSummary}</span>
          </Button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-64 p-2.5">
        <p className="mb-2.5 text-sm font-semibold text-foreground">{t("prompt.generationSettings")}</p>
        <p className="mb-2.5 break-words px-2 text-xs text-muted-foreground">{uiText("当前模型：{{ui:0}}", [summary.model])}</p>
        <div>
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t("prompt.imageSize")}</p>
          <div className="flex flex-col gap-0.5">
            {availablePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onSizeChange(preset.value)}
                className={cn(
                  "flex min-h-8 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                  size === preset.value && "bg-accent"
                )}
              >
                <span className="text-xs font-medium tabular-nums text-foreground">
                  {preset.value === "auto" ? t("prompt.auto") : preset.value}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {preset.value === "auto" ? t("prompt.imageSize.autoDescription") : preset.ratio}
                </span>
              </button>
            ))}
          </div>
        </div>
        {supportsCustomSize ? (
          <form
            className="mt-1.5 flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (canApplyCustom) onSizeChange(custom);
            }}
          >
            <Input
              value={w}
              onChange={(event) => setW(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label={uiText("宽")}
              placeholder={uiText("宽")}
              className="h-7 px-2 text-center text-xs tabular-nums"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Input
              value={h}
              onChange={(event) => setH(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label={uiText("高")}
              placeholder={uiText("高")}
              className="h-7 px-2 text-center text-xs tabular-nums"
            />
            <Button type="submit" size="sm" className="h-7 shrink-0 px-2 text-xs" disabled={!canApplyCustom}>
              {uiText("应用")}</Button>
          </form>
        ) : null}
        <Separator className="my-2" />
        {supportsQuality ? <>
          <fieldset className="px-0.5">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">{uiText("图片质量")}</legend>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(IMAGE_QUALITY_LABELS) as Array<keyof typeof IMAGE_QUALITY_LABELS>).map((value) => <button
                key={value} type="button" aria-pressed={(quality ?? "auto") === value}
                onClick={() => onQualityChange(value)}
                className={cn("min-h-8 rounded-md px-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", (quality ?? "auto") === value && "bg-accent font-medium")}
              >{uiText(IMAGE_QUALITY_LABELS[value])}</button>)}
            </div>
          </fieldset>
          <Separator className="my-2" />
        </> : <p className="mb-2 text-[11px] leading-5 text-muted-foreground">{uiText("此服务商由模型决定质量，不发送质量参数。")}</p>}
        {supportsTransparentBackground ? (
          <>
            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{t("prompt.transparentBackground")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("prompt.transparentBackground.description")}</p>
              </div>
              <Switch
                checked={transparentBackground}
                onCheckedChange={onTransparentBackgroundChange}
                aria-label={t("prompt.transparentBackground")}
              />
            </div>
            <Separator className="my-2" />
          </>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{t("prompt.imageCount")}</span>
          <div className="flex h-8 w-28 items-stretch overflow-hidden rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label={t("prompt.imageCount.decrease")}
              disabled={count <= 1}
              onClick={() => updateCount(count - 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="flex min-w-0 flex-1 items-center justify-center border-x border-border text-xs font-medium tabular-nums">
              {count}
            </span>
            <button
              type="button"
              aria-label={t("prompt.imageCount.increase")}
              disabled={count >= maxCount}
              onClick={() => updateCount(count + 1)}
              className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
