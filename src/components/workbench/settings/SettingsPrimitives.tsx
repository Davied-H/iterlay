import { type ReactNode } from "react";
import { useUiText } from "@/i18n";
import { cn } from "@/lib/utils";
import "./settings-shell.css";

export function SettingsPageHeader({ title, description, actions, children, className }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}): React.ReactElement {
  return <header className={cn("settings-page-header", className)}>
    <div className="settings-page-heading">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
    {actions ? <div className="settings-page-actions">{actions}</div> : null}
  </header>;
}

export function SettingsGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }): React.ReactElement {
  const uiText = useUiText();
  return <section className={cn("settings-group", className)}>
    <h3>{uiText(title)}</h3>
    <div className="settings-group-rows">{children}</div>
  </section>;
}

export function SettingsRow({ title, description, control, children, className, stackControlOnNarrow, disabled, interactive }: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
  stackControlOnNarrow?: boolean;
  disabled?: boolean;
  interactive?: boolean;
}): React.ReactElement {
  const uiText = useUiText();
  const Component = interactive ? "label" : "div";
  return <Component className={cn("settings-row", children && !control && "settings-row--fields", interactive && "settings-row--interactive", stackControlOnNarrow && "settings-row--stack", className)} data-disabled={disabled || undefined}>
    <div className="settings-row-main">
      <span className="settings-row-copy">
        <span className="settings-row-title">{typeof title === "string" ? uiText(title) : title}</span>
        {description ? <span className="settings-row-description">{typeof description === "string" ? uiText(description) : description}</span> : null}
      </span>
      {control ? <span className="settings-row-control">{control}</span> : null}
    </div>
    {children ? <div className="settings-row-fields">{children}</div> : null}
  </Component>;
}
