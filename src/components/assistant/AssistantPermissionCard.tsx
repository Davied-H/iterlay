import "./conversation-theme.css";
import { useId, useRef, useState } from "react";
import { Monitor, Settings2 } from "lucide-react";
import { useUiText } from "@/i18n";
import {
  OPEN_ASSISTANT_PERMISSIONS_EVENT,
  type ScreenPermissionDecision,
} from "@shared/screen-access";
import type { SceneAssistantInteraction } from "@shared/types";
import "./assistant-permission-card.css";

export function AssistantPermissionCard({
  interaction,
  disabled = false,
  onDecision,
}: {
  interaction: Extract<SceneAssistantInteraction, { type: "permission" }>;
  disabled?: boolean;
  onDecision: (decision: ScreenPermissionDecision) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const titleId = useId();
  const descriptionId = useId();
  const submittedRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [remember, setRemember] = useState(false);
  const locked = disabled || submitted;

  function decide(decision: ScreenPermissionDecision): void {
    if (locked || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    onDecision(decision);
  }

  return (
    <section
      className="assistant-permission-card"
      aria-label={uiText("屏幕查看授权")}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="assistant-permission-content">
        <header>
          <Monitor size={17} aria-hidden="true" />
          <h3 id={titleId}>{uiText("允许查看屏幕？")}</h3>
          <button
            type="button"
            className="assistant-permission-manage"
            aria-label={uiText("在设置中管理权限")}
            title={uiText("在设置中管理权限")}
            onClick={() =>
              window.dispatchEvent(new Event(OPEN_ASSISTANT_PERMISSIONS_EVENT))
            }
          >
            <Settings2 size={15} aria-hidden="true" />
          </button>
        </header>
        {interaction.description ? (
          <p className="assistant-permission-reason">
            {interaction.description}
          </p>
        ) : null}
        <div id={descriptionId} className="assistant-permission-scope">
          <p>
            {uiText("截图将发送至")}{" "}
            <strong>{interaction.providerLabel}</strong>
          </p>
          <p>{uiText("单张主屏幕截图，不录屏、不存本地。")}</p>
        </div>
      </div>
      <div className="assistant-permission-footer">
        <label className="assistant-permission-remember">
          <input
            type="checkbox"
            checked={remember}
            disabled={locked}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>{uiText("以后自动允许")}</span>
        </label>
        <div className="assistant-permission-actions">
          <button
            type="button"
            disabled={locked}
            onClick={() => decide("deny")}
          >
            {uiText("拒绝")}
          </button>
          <button
            type="button"
            data-primary="true"
            disabled={locked}
            onClick={() => decide(remember ? "allow_always" : "allow_once")}
          >
            {uiText("允许")}
          </button>
        </div>
      </div>
    </section>
  );
}
