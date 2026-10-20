import { useUiText } from "@/i18n";
import { useId } from "react";
import { CircleDotDashed, Film, Grid2X2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { cn } from "@/lib/utils";

export type GalleryMode = "lightbox" | "orbit" | "film";

interface GalleryModeSwitcherProps {
  value: GalleryMode;
  onChange: (mode: GalleryMode) => void;
}

const MODES = [
  { value: "lightbox" as const, label: "灵感灯箱", icon: Grid2X2 },
  { value: "orbit" as const, label: "环形漫游", icon: CircleDotDashed },
  { value: "film" as const, label: "生成胶片", icon: Film }
];

export function GalleryModeSwitcher({ value, onChange }: GalleryModeSwitcherProps): React.ReactElement {
  const uiText = useUiText();

  const indicatorId = `${useId()}-gallery-mode-indicator`;

  return (
    <div
      data-tour="gallery-modes"
      role="tablist"
      aria-label={uiText("画廊浏览模式")}
      className="flex h-8 items-center rounded-md bg-white/[0.055] p-0.5 ring-1 ring-white/[0.09]"
    >
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const active = value === mode.value;
        return (
          <Tooltip key={mode.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={uiText(mode.label)}
                onClick={() => onChange(mode.value)}
                className={cn(
                  "relative isolate flex h-7 w-9 items-center justify-center rounded-[5px] text-white/42 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 motion-reduce:transition-none",
                  active ? "text-white" : "hover:bg-white/[0.06] hover:text-white/75"
                )}
              >
                {active ? (
                  <SegmentedControlIndicator
                    layoutId={indicatorId}
                    className="rounded-[5px] bg-white/[0.12]"
                  />
                ) : null}
                <Icon className="relative z-10 h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{uiText(mode.label)}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
