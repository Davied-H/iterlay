import type { AssistantHistoryConversation } from "@/lib/assistant-history";
import { useUiText } from "@/i18n";
import { getUiTextLocale } from "@/i18n/ui-text";

interface Props {
  conversations?: AssistantHistoryConversation[];
  loading?: boolean;
  error?: string;
  currentId?: string;
  showBoardName?: boolean;
  onSelect: (conversation: AssistantHistoryConversation) => void;
  onRetry?: () => void;
}
export function AssistantHistoryList({
  conversations = [],
  loading,
  error,
  currentId,
  showBoardName,
  onSelect,
  onRetry,
}: Props): React.ReactElement {
  const locale = getUiTextLocale();
  const uiText = useUiText();
  return (
    <div className="assistant-chat-history-list" aria-busy={loading}>
      {loading ? (
        <p role="status">{uiText("正在读取历史…")}</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          {onRetry ? (
            <button
              type="button"
              className="ct-button ct-button-quiet"
              onClick={onRetry}
            >
              {uiText("重新加载")}
            </button>
          ) : null}
        </div>
      ) : conversations.length === 0 ? (
        <p>{uiText("暂无会话历史")}</p>
      ) : (
        conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            aria-label={uiText("打开会话：{{ui:0}}", [conversation.title])}
            aria-current={conversation.id === currentId ? "true" : undefined}
            onClick={() => onSelect(conversation)}
          >
            <span>
              <strong>{conversation.title}</strong>
              <time>
                {new Date(conversation.updatedAt).toLocaleDateString(locale)}
              </time>
            </span>
            <p>{conversation.preview}</p>
            <small>
              {showBoardName && conversation.boardName
                ? `${conversation.boardName} · `
                : ""}
              {`${conversation.exchangeCount} ${uiText("轮")}`}
            </small>
          </button>
        ))
      )}
    </div>
  );
}
