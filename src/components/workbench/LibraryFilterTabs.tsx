import { useId } from "react";

import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { cn } from "@/lib/utils";

export interface LibraryFilterTabOption<Value extends string> {
  value: Value;
  label: string;
  count?: number;
  id?: string;
  controls?: string;
}

interface LibraryFilterTabsProps<Value extends string> {
  value: Value;
  options: readonly LibraryFilterTabOption<Value>[];
  ariaLabel: string;
  semantics?: "group" | "tablist";
  disabled?: boolean;
  className?: string;
  countClassName?: string;
  onValueChange: (value: Value) => void;
}

/** Shared segmented tabs for library filters and top-level workspace views. */
export function LibraryFilterTabs<Value extends string>({
  value,
  options,
  ariaLabel,
  semantics = "group",
  disabled = false,
  className,
  countClassName,
  onValueChange
}: LibraryFilterTabsProps<Value>): React.ReactElement {
  const indicatorId = `${useId()}-library-filter-indicator`;

  return (
    <div
      role={semantics}
      aria-label={ariaLabel}
      className={cn(
        "inline-grid shrink-0 items-center rounded-lg border border-border bg-muted/40 p-0.5",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={option.id}
            type="button"
            role={semantics === "tablist" ? "tab" : undefined}
            aria-controls={option.controls}
            aria-selected={semantics === "tablist" ? active : undefined}
            aria-pressed={semantics === "group" ? active : undefined}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative isolate h-6 rounded-md px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              active
                ? "text-primary-foreground"
                : "text-muted-foreground transition-colors hover:text-foreground"
            )}
          >
            {active ? (
              <SegmentedControlIndicator
                layoutId={indicatorId}
                className="rounded-md bg-primary shadow-sm"
              />
            ) : null}
            <span className="relative z-10 whitespace-nowrap">
              {option.label}
              {option.count !== undefined ? (
                <span
                  data-filter-count=""
                  className={cn(
                    "ml-1 tabular-nums",
                    active ? "text-primary-foreground/70" : "opacity-75",
                    countClassName
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
