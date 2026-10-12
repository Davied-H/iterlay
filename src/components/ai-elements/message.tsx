import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Core AI Elements message primitives, deliberately presentation-free. */
export function Message({ from, className, ...props }: HTMLAttributes<HTMLDivElement> & { from: "user" | "assistant" }): React.ReactElement {
  return <div className={cn("ai-message", from === "user" ? "ai-message--user" : "ai-message--assistant", className)} {...props} />;
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("ai-message-content", className)} {...props} />;
}
