import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LineageItem {
  label: string;
  onClick?: () => void;
  current?: boolean;
}

interface LineageBreadcrumbProps {
  items: LineageItem[];
}

export function LineageBreadcrumb({ items }: LineageBreadcrumbProps): React.ReactElement | null {
  if (items.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="版本血缘">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />}
          {item.onClick && !item.current ? (
            <button
              type="button"
              onClick={item.onClick}
              className="rounded px-1 py-0.5 underline-offset-2 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn("px-1 py-0.5", item.current && "font-medium text-foreground")}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
