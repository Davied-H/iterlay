import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }): React.ReactElement {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <h3 className="px-0.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border/80 overflow-hidden border-y border-border/80 bg-card">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  control,
  children,
  stackControlOnNarrow
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  stackControlOnNarrow?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3.5 px-4 py-4 transition-colors duration-150">
      <div className={cn(
        "flex items-center justify-between gap-8",
        stackControlOnNarrow && "max-[520px]:flex-col max-[520px]:items-stretch max-[520px]:gap-3"
      )}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-5 text-foreground">{title}</span>
          {description ? <span className="max-w-[64ch] text-xs leading-5 text-muted-foreground">{description}</span> : null}
        </span>
        {control ? (
          <span className={cn("flex shrink-0 items-center", stackControlOnNarrow && "max-[520px]:self-end")}>
            {control}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
