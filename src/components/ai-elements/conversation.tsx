import type { ComponentProps } from "react";
import { useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";

/** AI Elements conversation primitive, kept local so Iterlay owns its product styling. */
export function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>): React.ReactElement {
  return <StickToBottom className={cn("relative overflow-y-hidden", className)} initial="smooth" resize="smooth" role="log" {...props} />;
}

export function ConversationContent({ className, ...props }: ComponentProps<typeof StickToBottom.Content>): React.ReactElement {
  return <StickToBottom.Content className={cn("flex flex-col", className)} {...props} />;
}

export function ConversationScrollButton({ className }: { className?: string }): React.ReactElement | null {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const handleClick = useCallback(() => scrollToBottom(), [scrollToBottom]);
  if (isAtBottom) return null;
  return <button type="button" className={cn("ai-conversation-scroll", className)} onClick={handleClick} aria-label="回到最新消息"><ArrowDown /></button>;
}
