import type { GeneratedImage } from "@/components/canvas/ImageNode";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Check, ImagePlus, Upload } from "lucide-react";
import { useState } from "react";
import { ToolbarReveal, ToolbarTooltip } from "./PromptToolbar";

export function ReferencePicker({
  boardImages,
  referenceCount,
  referencedNodeIds,
  atLimit,
  onAddCanvasReference,
  onReferenceFiles,
  onOpenChange,
  showLabel = true,
  materialMode = false,
  reduceMotion = false
}: {
  boardImages: GeneratedImage[];
  referenceCount: number;
  referencedNodeIds: Set<string>;
  atLimit: boolean;
  onAddCanvasReference: (image: GeneratedImage) => void;
  onReferenceFiles: (files: FileList | null) => void;
  onOpenChange?: (open: boolean) => void;
  showLabel?: boolean;
  materialMode?: boolean;
  reduceMotion?: boolean;
}): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pickable = boardImages.filter((image) => !image.pending && Boolean(image.dataUrl));
  const addLabel = t(materialMode ? "prompt.uiDesign.material.add" : "prompt.references.add");

  function changeOpen(next: boolean): void {
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <ToolbarTooltip label={addLabel} disabled={open}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-0 px-2 sm:px-2.5"
            aria-label={addLabel}
            data-tour="dock-reference"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <ToolbarReveal visible={showLabel} reduceMotion={reduceMotion}>
              {t(materialMode ? "prompt.uiDesign.material.label" : "prompt.references.label")}
            </ToolbarReveal>
            {referenceCount > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                {referenceCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </ToolbarTooltip>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-80 p-2">
        <div className="flex items-center justify-between px-0.5 pb-1.5">
          <span className="text-xs font-medium text-foreground">
            {t(materialMode ? "prompt.uiDesign.material.chooseFromCanvas" : "prompt.references.chooseFromCanvas")}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{referenceCount}/4</span>
        </div>
        {pickable.length > 0 ? (
          <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
            {pickable.map((image) => {
              const added = referencedNodeIds.has(image.id);
              const disabled = added || atLimit;
              return (
                <button
                  key={image.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAddCanvasReference(image)}
                  className={cn(
                    "group/pick relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled && "cursor-not-allowed"
                  )}
                  title={added
                    ? t("prompt.references.added")
                    : atLimit
                      ? t("prompt.references.limitReached", { max: 4 })
                      : t("prompt.references.use")}
                >
                  <img src={image.dataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                  {added ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-primary/70 text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : atLimit ? (
                    <span className="absolute inset-0 bg-background/60" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
            {t("prompt.references.emptyCanvas")}
          </p>
        )}

        <Separator className="my-2" />

        <label
          className={cn(
            "flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent/50",
            atLimit && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="h-4 w-4" />
          {t(materialMode ? "prompt.uiDesign.material.upload" : "prompt.references.upload")}
          <input
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={atLimit}
            onChange={(event) => {
              onReferenceFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <p className="px-0.5 pt-1.5 text-[11px] text-muted-foreground">
          {t("prompt.references.pasteHint")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
