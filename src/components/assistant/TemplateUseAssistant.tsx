import { useUiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  AiAssistantContextImage,
  AiAssistantMessage,
} from "./assistant-types";
import { AssistantChat } from "./AssistantChat";

interface TemplateUseAssistantProps {
  templateName: string;
  templatePrompt: string;
  templateFields?: Array<{ label: string; value: string }>;
  messages: AiAssistantMessage[];
  value: string;
  streaming?: boolean;
  contextImages?: AiAssistantContextImage[];
  suggestions?: string[];
  suggestionsLoading?: boolean;
  canSubmitWithoutText?: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onClose: () => void;
  onAttach: () => void;
  onPasteImages: (files: File[]) => void;
  onSuggestionSelect: (suggestion: string) => void;
  onRefreshSuggestions: () => void;
  onApplyPrompt: (prompt: string) => void;
  onGeneratePrompt: (prompt: string) => void;
  canGenerateImmediately?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

interface TemplateFocusItem {
  label: string;
  source: "模板字段" | "Prompt 段落" | "模板原文";
}

type TemplateRequestStatus = "pending" | "provided" | "included";

interface TemplateRequestItem {
  label: string;
  status: TemplateRequestStatus;
}

function normalizeRequestLabel(value: string): string {
  return value
    .replace(/^(?:请|需要)?(?:填写|补充|替换为|输入)/u, "")
    .replace(/[。；;，,]+$/u, "")
    .trim();
}

function getTemplateFocus(
  fields: Array<{ label: string; value: string }> | undefined,
  prompt: string,
  requests: string[],
): TemplateFocusItem[] {
  const requestSet = new Set(requests.map(normalizeRequestLabel));
  const isVariableLabel = (label: string): boolean =>
    requestSet.has(normalizeRequestLabel(label)) ||
    /(?:本次|需求|变量|替换|填写|补充)/u.test(label);
  const fieldLabels = unique(
    fields
      ?.filter(
        (field) =>
          !/【[^】]+】/u.test(field.value) && !isVariableLabel(field.label),
      )
      .map((field) => field.label) ?? [],
  );
  const promptLabels = prompt.split("\n").flatMap((line) => {
    const match = line.trim().match(/^([^：:]{2,14})[：:]/u);
    return match?.[1] && !/【[^】]+】/u.test(line) && !isVariableLabel(match[1])
      ? [match[1]]
      : [];
  });
  const fromFields = fieldLabels.map((label) => ({
    label,
    source: "模板字段" as const,
  }));
  const fieldSet = new Set(fieldLabels);
  const fromPrompt = unique(promptLabels)
    .filter((label) => label !== "提示词" && !fieldSet.has(label))
    .map((label) => ({ label, source: "Prompt 段落" as const }));
  const focus = [...fromFields, ...fromPrompt].slice(0, 4);
  return focus.length > 0
    ? focus
    : [{ label: "模板原始 Prompt", source: "模板原文" }];
}

function getTemplateRequests(
  prompt: string,
  fields: Array<{ value: string }> | undefined,
): string[] {
  const source = [prompt, ...(fields?.map((field) => field.value) ?? [])].join(
    "\n",
  );
  const placeholders = [...source.matchAll(/【([^】]+)】/gu)].map((match) =>
    normalizeRequestLabel(match[1]),
  );
  return unique(placeholders).slice(0, 4);
}

function requestMentioned(request: string, userText: string): boolean {
  const normalizedText = userText.replace(/\s+/gu, "").toLocaleLowerCase();
  const candidates = unique([
    request,
    ...request.split(/[、，,；;和与及或/]/u),
  ]).map((value) =>
    value
      .replace(/^(?:请|需要)?(?:填写|补充|替换为|输入)/u, "")
      .replace(/\s+/gu, "")
      .toLocaleLowerCase(),
  );
  return candidates.some(
    (candidate) => candidate.length >= 2 && normalizedText.includes(candidate),
  );
}

function getRequestItems({
  requests,
  messages,
  generatedPrompt,
  hasContextImages,
}: {
  requests: string[];
  messages: AiAssistantMessage[];
  generatedPrompt: string;
  hasContextImages: boolean;
}): TemplateRequestItem[] {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const unresolvedRequests = new Set(
    [...generatedPrompt.matchAll(/【([^】]+)】/gu)].map((match) =>
      normalizeRequestLabel(match[1]),
    ),
  );
  return requests.map((label) => {
    const unresolvedInProposal = unresolvedRequests.has(label);
    if (generatedPrompt && !unresolvedInProposal)
      return { label, status: "included" };
    const suppliedByImage =
      hasContextImages && /(?:图|图片|图像|素材|参考|头像|照片)/u.test(label);
    if (suppliedByImage || requestMentioned(label, userText))
      return { label, status: "provided" };
    return { label, status: "pending" };
  });
}

function getFallbackSuggestions(requests: TemplateRequestItem[]): string[] {
  const pending = requests
    .filter((item) => item.status === "pending")
    .map((item) => item.label);
  const pendingSummary = pending.slice(0, 3).join("、");
  return [
    pending.length > 0
      ? `补全：${pendingSummary}${pending.length > 3 ? "等" : ""}`
      : "检查是否还缺少关键信息",
    "整理 3 组差异明显的方案",
    "检查需求是否与模板规则冲突",
  ];
}

function TemplateBrief({
  focus,
  requests,
  expanded,
  onExpandedChange,
  onRequestSelect,
}: {
  focus: TemplateFocusItem[];
  requests: TemplateRequestItem[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRequestSelect: (request: string) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const pendingCount = requests.filter(
    (item) => item.status === "pending",
  ).length;
  const statusLabels = {
    pending: "待补充",
    provided: "已提供",
    included: "已纳入方案",
  };
  const summary =
    requests.length === 0
      ? `${focus.length} 项保留 · 无需补充`
      : pendingCount
        ? `${focus.length} 项保留 · ${pendingCount} 项待补`
        : `${focus.length} 项保留 · 信息已齐`;
  return (
    <section
      className="ct-plan-archive assistant-template-brief"
      aria-label={uiText("模板使用说明")}
    >
      <button
        type="button"
        className="assistant-chat-prompt-toggle"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span>
          {uiText("模板约束")} · {summary}
        </span>
        <span className="sr-only">
          {uiText(expanded ? "收起模板使用说明" : "展开模板使用说明")}
        </span>
        <ChevronDown size={15} />
      </button>
      {expanded ? (
        <div className="assistant-chat-prompt-content">
          <h3>{uiText("自动保留")}</h3>
          <div className="assistant-template-focus">
            {focus.map((item) => (
              <span
                key={`${item.source}-${item.label}`}
                title={`${item.source}：${item.label}`}
              >
                {item.label}
              </span>
            ))}
          </div>
          <h3>{uiText("需要补充")}</h3>
          {requests.length ? (
            <ul aria-label={uiText("需要补充的内容")}>
              {requests.map((item) => (
                <li key={item.label} data-request-status={item.status}>
                  {item.status === "pending" ? (
                    <button
                      type="button"
                      className="ct-button ct-button-quiet"
                      aria-label={uiText("补充{{ui:0}}", [item.label])}
                      onClick={() => onRequestSelect(item.label)}
                    >
                      {item.label} · {uiText(statusLabels[item.status])}
                    </button>
                  ) : (
                    <span>
                      {item.label} · {uiText(statusLabels[item.status])}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>{uiText("直接描述本次目标即可。")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PromptProposal({
  prompt,
  canGenerateImmediately,
  onApply,
  onGenerate,
  onDismiss,
}: {
  prompt: string;
  canGenerateImmediately: boolean;
  onApply: (prompt: string) => void;
  onGenerate: (prompt: string) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  return (
    <section
      className="ct-card assistant-template-proposal"
      aria-label={uiText("确认生成方案")}
    >
      <header className="ct-card-heading">
        <h3>{uiText("应用这版提示词？")}</h3>
        <p>{uiText("可先编辑，再回填输入框或直接生成。")}</p>
      </header>
      <textarea
        value={draftPrompt}
        aria-label={uiText("确认生成方案内容")}
        onChange={(event) => setDraftPrompt(event.target.value)}
      />
      <footer className="ct-card-actions">
        <button
          type="button"
          className="ct-button ct-button-quiet"
          aria-label={uiText("继续调整方案")}
          onClick={onDismiss}
        >
          {uiText("继续调整方案")}
        </button>
        <button
          type="button"
          className="ct-button ct-button-quiet"
          disabled={!draftPrompt.trim()}
          onClick={() => onApply(draftPrompt)}
        >
          {uiText("应用提示词")}
        </button>
        <button
          type="button"
          className="ct-button ct-button-primary"
          disabled={!draftPrompt.trim() || !canGenerateImmediately}
          onClick={() => onGenerate(draftPrompt)}
        >
          {uiText("立即生成")}
        </button>
      </footer>
    </section>
  );
}

export function TemplateUseAssistant({
  templateName,
  templatePrompt,
  templateFields,
  messages,
  value,
  streaming = false,
  contextImages = [],
  suggestions = [],
  suggestionsLoading = false,
  canSubmitWithoutText = false,
  onValueChange,
  onSubmit,
  onStop,
  onClose,
  onAttach,
  onPasteImages,
  onSuggestionSelect,
  onRefreshSuggestions,
  onApplyPrompt,
  onGeneratePrompt,
  canGenerateImmediately = false,
}: TemplateUseAssistantProps): React.ReactElement {
  const uiText = useUiText();

  const rootRef = useRef<HTMLDivElement>(null);
  const requests = useMemo(
    () => getTemplateRequests(templatePrompt, templateFields),
    [templateFields, templatePrompt],
  );
  const focus = useMemo(
    () => getTemplateFocus(templateFields, templatePrompt, requests),
    [requests, templateFields, templatePrompt],
  );
  const latestPrompt =
    [...messages]
      .reverse()
      .find((message) => !message.streaming && message.generatedPrompt?.trim())
      ?.generatedPrompt?.trim() ?? "";
  const requestItems = useMemo(
    () =>
      getRequestItems({
        requests,
        messages,
        generatedPrompt: latestPrompt,
        hasContextImages: contextImages.length > 0,
      }),
    [contextImages.length, latestPrompt, messages, requests],
  );
  const hasUserMessage = messages.some(
    (message) => message.role === "user" && message.content.trim(),
  );
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState("");
  const previousHasUserMessageRef = useRef(hasUserMessage);
  const fallbackSuggestions = useMemo(
    () => getFallbackSuggestions(requestItems),
    [requestItems],
  );
  const visibleSuggestions =
    suggestions.length > 0 ? suggestions : fallbackSuggestions;

  useEffect(() => {
    if (hasUserMessage && !previousHasUserMessageRef.current)
      setBriefExpanded(false);
    previousHasUserMessageRef.current = hasUserMessage;
  }, [hasUserMessage]);

  function selectRequest(request: string): void {
    const nextLine = `关于「${request}」：`;
    onValueChange(value.trim() ? `${value.trimEnd()}\n${nextLine}` : nextLine);
    window.requestAnimationFrame(() =>
      rootRef.current?.querySelector("textarea")?.focus(),
    );
  }

  return (
    <div ref={rootRef} className="assistant-template-root">
      <AssistantChat
        variant="docked"
        title={templateName}
        subtitle={uiText("模板助手")}
        messages={messages}
        value={value}
        placeholder={uiText("描述本次要生成的内容…")}
        streaming={streaming}
        contextImages={contextImages}
        canSubmitWithoutText={canSubmitWithoutText}
        onValueChange={onValueChange}
        onSubmit={onSubmit}
        onStop={onStop}
        onClose={onClose}
        onAttach={onAttach}
        onPasteImages={onPasteImages}
        intentSuggestionsEnabled={!latestPrompt && !streaming}
        intentSuggestions={visibleSuggestions.slice(0, 2)}
        intentSuggestionsLoading={suggestionsLoading}
        onIntentSuggestionSelect={onSuggestionSelect}
        onRefreshIntentSuggestions={onRefreshSuggestions}
        onApplyGeneratedPrompt={onApplyPrompt}
        beforeMessages={
          <TemplateBrief
            focus={focus}
            requests={requestItems}
            expanded={briefExpanded}
            onExpandedChange={setBriefExpanded}
            onRequestSelect={selectRequest}
          />
        }
        afterMessages={
          latestPrompt && latestPrompt !== dismissedPrompt && !streaming ? (
            <PromptProposal
              key={latestPrompt}
              prompt={latestPrompt}
              canGenerateImmediately={canGenerateImmediately}
              onApply={onApplyPrompt}
              onGenerate={onGeneratePrompt}
              onDismiss={() => setDismissedPrompt(latestPrompt)}
            />
          ) : null
        }
      />
    </div>
  );
}
