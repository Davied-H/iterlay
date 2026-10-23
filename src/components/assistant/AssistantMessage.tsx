import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

export function AssistantMessageFrame({
  role,
  children,
  actions,
  label,
}: {
  role: "user" | "assistant";
  children: ReactNode;
  actions?: ReactNode;
  label?: string;
}): React.ReactElement {
  return (
    <article
      className={role === "user" ? "create-chat-user" : "create-chat-assistant"}
      data-assistant-message={role}
      aria-label={label}
    >
      {children}
      {actions ? (
        <div className="create-chat-message-actions">{actions}</div>
      ) : null}
    </article>
  );
}
export function AssistantResponse({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}): React.ReactElement {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="create-chat-response"
      data-assistant-message-body=""
      data-streaming={Boolean(streaming)}
    >
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        animated={
          reduceMotion
            ? false
            : { animation: "fadeIn", duration: 110, sep: "char", stagger: 7 }
        }
        isAnimating={Boolean(streaming && !reduceMotion)}
        caret={streaming ? "block" : undefined}
        controls={false}
        linkSafety={{ enabled: true }}
      >
        {content}
      </Streamdown>
    </div>
  );
}
