import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
export function ToolbarReveal({
  visible,
  reduceMotion,
  children,
  className
}: {
  visible: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span
      aria-hidden={!visible}
      className={cn(
        "prompt-dock-toolbar-label hidden min-w-0 overflow-hidden whitespace-nowrap sm:grid",
        visible ? "ml-1 grid-cols-[1fr] opacity-100" : "ml-0 grid-cols-[0fr] opacity-0",
        !reduceMotion && "transition-[grid-template-columns,margin-left,opacity] duration-300 ease-out",
        className
      )}
    >
      <span className="min-w-0 overflow-hidden">{children}</span>
    </span>
  );
}

export function ToolbarTooltip({
  label,
  disabled = false,
  children
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactElement;
}): React.ReactElement {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip
        open={!disabled && open}
        onOpenChange={(next) => setOpen(!disabled && next)}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

