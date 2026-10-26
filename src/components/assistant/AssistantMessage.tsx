import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [visible, setVisible] = useState(streaming && !reduceMotion ? "" : content);
  const animate = useRef(Boolean(streaming));
  if (streaming) animate.current = true;
  useEffect(() => {
    if (reduceMotion || !animate.current) {
      setVisible(content);
      return;
    }
    if (visible === content) return;
    const timer = window.setTimeout(() => {
      setVisible((previous) => {
        const next = content;
        if (!next.startsWith(previous)) return next;
        const remaining = Array.from(next.slice(previous.length));
        // Catch up with large chunks without making long replies wait for playback.
        return previous + remaining.slice(0, Math.max(1, Math.ceil(remaining.length / 12))).join("");
      });
    }, 24);
    return () => window.clearTimeout(timer);
  }, [content, visible, reduceMotion]);
  const revealing = Boolean(streaming || visible !== content);
  return (
    <div
      className="create-chat-response"
      data-assistant-message-body=""
      data-streaming={Boolean(streaming)}
    >
      <Streamdown
        mode={revealing ? "streaming" : "static"}
        animated={
          reduceMotion
            ? false
            : { animation: "fadeIn", duration: 110, sep: "char", stagger: 7 }
        }
        isAnimating={Boolean(revealing && !reduceMotion)}
        caret={revealing ? "block" : undefined}
        controls={false}
        linkSafety={{ enabled: true }}
      >
        {visible}
      </Streamdown>
    </div>
  );
}
