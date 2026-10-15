import { useUiText } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Circle,
  CircleCheck,
  ImagePlus,
  Loader2,
  Paperclip,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  X
} from "lucide-react";
import type { AiAssistantContextImage, AiAssistantMessage } from "@/components/assistant/AiAssistant";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { isSendEnter } from "@/lib/send-on-enter";
import { cn } from "@/lib/utils";

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
  requests: string[]
): TemplateFocusItem[] {
  const requestSet = new Set(requests.map(normalizeRequestLabel));
  const isVariableLabel = (label: string): boolean => (
    requestSet.has(normalizeRequestLabel(label))
    || /(?:本次|需求|变量|替换|填写|补充)/u.test(label)
  );
  const fieldLabels = unique(fields
    ?.filter((field) => !/【[^】]+】/u.test(field.value) && !isVariableLabel(field.label))
    .map((field) => field.label) ?? []);
  const promptLabels = prompt.split("\n").flatMap((line) => {
    const match = line.trim().match(/^([^：:]{2,14})[：:]/u);
    return match?.[1] && !/【[^】]+】/u.test(line) && !isVariableLabel(match[1]) ? [match[1]] : [];
  });
  const fromFields = fieldLabels.map((label) => ({ label, source: "模板字段" as const }));
  const fieldSet = new Set(fieldLabels);
  const fromPrompt = unique(promptLabels)
    .filter((label) => label !== "提示词" && !fieldSet.has(label))
    .map((label) => ({ label, source: "Prompt 段落" as const }));
  const focus = [...fromFields, ...fromPrompt].slice(0, 4);
  return focus.length > 0 ? focus : [{ label: "模板原始 Prompt", source: "模板原文" }];
}

function getTemplateRequests(prompt: string, fields: Array<{ value: string }> | undefined): string[] {
  const source = [prompt, ...(fields?.map((field) => field.value) ?? [])].join("\n");
  const placeholders = [...source.matchAll(/【([^】]+)】/gu)].map((match) => normalizeRequestLabel(match[1]));
  return unique(placeholders).slice(0, 4);
}

function requestMentioned(request: string, userText: string): boolean {
  const normalizedText = userText.replace(/\s+/gu, "").toLocaleLowerCase();
  const candidates = unique([
    request,
    ...request.split(/[、，,；;和与及或/]/u)
  ]).map((value) => value.replace(/^(?:请|需要)?(?:填写|补充|替换为|输入)/u, "").replace(/\s+/gu, "").toLocaleLowerCase());
  return candidates.some((candidate) => candidate.length >= 2 && normalizedText.includes(candidate));
}

function getRequestItems({
  requests,
  messages,
  generatedPrompt,
  hasContextImages
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
    [...generatedPrompt.matchAll(/【([^】]+)】/gu)].map((match) => normalizeRequestLabel(match[1]))
  );
  return requests.map((label) => {
    const unresolvedInProposal = unresolvedRequests.has(label);
    if (generatedPrompt && !unresolvedInProposal) return { label, status: "included" };
    const suppliedByImage = hasContextImages && /(?:图|图片|图像|素材|参考|头像|照片)/u.test(label);
    if (suppliedByImage || requestMentioned(label, userText)) return { label, status: "provided" };
    return { label, status: "pending" };
  });
}

function getFallbackSuggestions(requests: TemplateRequestItem[]): string[] {
  const pending = requests.filter((item) => item.status === "pending").map((item) => item.label);
  const pendingSummary = pending.slice(0, 3).join("、");
  return [
    pending.length > 0
      ? `补全：${pendingSummary}${pending.length > 3 ? "等" : ""}`
      : "检查是否还缺少关键信息",
    "整理 3 组差异明显的方案",
    "检查需求是否与模板规则冲突"
  ];
}

function TemplateBrief({
  focus,
  requests,
  expanded,
  onExpandedChange,
  onRequestSelect
}: {
  focus: TemplateFocusItem[];
  requests: TemplateRequestItem[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRequestSelect: (request: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  const statusLabels: Record<TemplateRequestStatus, string> = {
    pending: "待补充",
    provided: "已提供",
    included: "已纳入方案"
  };
  const pendingCount = requests.filter((item) => item.status === "pending").length;
  const compactSummary = requests.length === 0
    ? `${focus.length} 项保留 · 无需补充`
    : pendingCount > 0
      ? `${focus.length} 项保留 · ${pendingCount} 项待补`
      : `${focus.length} 项保留 · 信息已齐`;
  return (
    <section className="shrink-0 border-b border-[#e5e5e1] px-3 dark:border-border" aria-label={uiText("模板使用说明")}>
      <div className="overflow-hidden">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="flex min-h-10 w-full items-center gap-2 text-left transition-colors hover:text-[#242422] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:text-foreground"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#6f6f69] dark:text-foreground/75" />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap">
            <span className="shrink-0 text-[11px] font-medium text-[#4b4b47] dark:text-foreground">{uiText("模板约束")}</span>
            <span className="text-[10px] text-[#b2b2ac]">·</span>
            <span className="min-w-0 truncate text-[10px] text-[#777772] dark:text-muted-foreground" title={compactSummary}>{compactSummary}</span>
          </span>
          <span className="sr-only">{expanded ? uiText("收起模板使用说明") : uiText("展开模板使用说明")}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[#92928c] transition-transform", expanded && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-[#e5e5e1] dark:border-border"
            >
              <div className="py-2.5 text-[11px]">
                <div className="grid grid-cols-[54px_minmax(0,1fr)] items-start gap-2">
                  <div>
                    <p className="font-medium text-[#666660] dark:text-foreground/90">{uiText("自动保留")}</p>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {focus.map((item) => (
                      <span key={`${item.source}-${item.label}`} title={`${item.source}：${item.label}`} className="max-w-full truncate rounded bg-[#f0f0ed] px-1.5 py-0.5 text-[#5d5d58] dark:bg-muted dark:text-foreground/85">
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[54px_minmax(0,1fr)] items-start gap-2">
                  <div>
                    <p className="font-medium text-[#666660] dark:text-foreground/90">{uiText("需要补充")}</p>
                  </div>
                  {requests.length > 0 ? (
                    <ul className="grid min-w-0 gap-1" aria-label={uiText("需要补充的内容")}>
                      {requests.map((item) => {
                        const pending = item.status === "pending";
                        const content = (
                          <>
                            {pending ? <Circle className="h-3.5 w-3.5 shrink-0 text-[#aaa9a3]" /> : <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />}
                            <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
                            <span className={cn("shrink-0 text-[9px]", pending ? "text-[#85857f] dark:text-muted-foreground" : "text-emerald-700 dark:text-emerald-400")}>{statusLabels[item.status]}</span>
                          </>
                        );
                        return (
                          <li key={item.label} data-request-status={item.status} className="min-w-0">
                            {pending ? (
                              <button type="button" aria-label={uiText("补充{{ui:0}}", [item.label])} onClick={() => onRequestSelect(item.label)} className="flex min-h-7 w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[#444440] transition-colors hover:bg-[#f0f0ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground/85 dark:hover:bg-accent">
                                {content}
                              </button>
                            ) : (
                              <div className="flex min-h-7 items-center gap-1.5 px-1.5 py-1 text-[#555550] dark:text-foreground/85">
                                {content}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-1 text-[#777772] dark:text-muted-foreground">{uiText("直接描述本次目标即可。")}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

function PromptProposal({
  prompt,
  canGenerateImmediately,
  onApply,
  onGenerate,
  onDismiss
}: {
  prompt: string;
  canGenerateImmediately: boolean;
  onApply: (prompt: string) => void;
  onGenerate: (prompt: string) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const [draftPrompt, setDraftPrompt] = useState(prompt);

  useEffect(() => setDraftPrompt(prompt), [prompt]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-2 bottom-2 z-10 flex max-h-[min(380px,calc(100%_-_16px))] flex-col overflow-hidden rounded-[10px] border border-[#d8d8d4] bg-[#fbfbf9] shadow-[0_4px_12px_rgba(22,22,20,0.12)] dark:border-border dark:bg-popover dark:shadow-none"
      aria-label={uiText("确认生成方案")}
    >
      <div className="min-h-0 overflow-y-auto p-3">
        <div className="flex min-h-8 items-start gap-2">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold leading-5">{uiText("应用这版提示词？")}</span>
            <span className="mt-0.5 block text-xs leading-[1.5] text-muted-foreground">{uiText("可先编辑，再回填输入框或直接生成。")}</span>
          </span>
          <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground" aria-label={uiText("继续调整方案")} onClick={onDismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-3 border-t border-[#e4e4e0] pt-3 dark:border-border">
          <p className="text-[11px] font-medium leading-4 text-[#686865] dark:text-muted-foreground">{uiText("将应用的提示词")}</p>
          <textarea
            value={draftPrompt}
            aria-label={uiText("确认生成方案内容")}
            onChange={(event) => setDraftPrompt(event.target.value)}
            className="mt-2 max-h-40 min-h-24 w-full resize-y rounded-lg border border-[#dededa] bg-[#f8f8f6] px-2.5 py-2 text-xs leading-5 text-[#30302e] outline-none [overflow-wrap:anywhere] focus:border-[#747470] focus:ring-2 focus:ring-[#747470]/20 dark:border-border dark:bg-secondary dark:text-foreground dark:focus:border-ring dark:focus:ring-ring/20"
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-[#e4e4e0] px-3 py-2.5 dark:border-border">
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2.5 text-xs" disabled={!draftPrompt.trim()} onClick={() => onApply(draftPrompt)}>
          {uiText("应用提示词")}</Button>
        <Button type="button" size="sm" className="h-8 rounded-lg bg-[#30302e] px-2.5 text-xs text-[#f4f4f1] hover:bg-[#242422] dark:bg-primary dark:text-primary-foreground" disabled={!draftPrompt.trim() || !canGenerateImmediately} onClick={() => onGenerate(draftPrompt)}>
          <Play className="mr-1 h-3.5 w-3.5" />
          {uiText("立即生成")}</Button>
      </div>
    </motion.section>
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
  canGenerateImmediately = false
}: TemplateUseAssistantProps): React.ReactElement {
  const uiText = useUiText();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const requests = useMemo(() => getTemplateRequests(templatePrompt, templateFields), [templateFields, templatePrompt]);
  const focus = useMemo(() => getTemplateFocus(templateFields, templatePrompt, requests), [requests, templateFields, templatePrompt]);
  const latestPrompt = [...messages].reverse().find((message) => !message.streaming && message.generatedPrompt?.trim())?.generatedPrompt?.trim() ?? "";
  const requestItems = useMemo(() => getRequestItems({
    requests,
    messages,
    generatedPrompt: latestPrompt,
    hasContextImages: contextImages.length > 0
  }), [contextImages.length, latestPrompt, messages, requests]);
  const hasUserMessage = messages.some((message) => message.role === "user" && message.content.trim());
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState("");
  const previousHasUserMessageRef = useRef(hasUserMessage);
  const fallbackSuggestions = useMemo(() => getFallbackSuggestions(requestItems), [requestItems]);
  const visibleSuggestions = suggestions.length > 0 ? suggestions : fallbackSuggestions;
  const canSubmit = Boolean(value.trim()) || canSubmitWithoutText;

  useEffect(() => {
    if (hasUserMessage && !previousHasUserMessageRef.current) setBriefExpanded(false);
    previousHasUserMessageRef.current = hasUserMessage;
  }, [hasUserMessage]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduceMotion || streaming ? "auto" : "smooth" });
  }, [messages, reduceMotion, streaming, suggestions]);

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const files = extractClipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    onPasteImages(files);
  }

  function submit(): void {
    if (!streaming && canSubmit) onSubmit();
  }

  function selectRequest(request: string): void {
    const nextLine = `关于「${request}」：`;
    onValueChange(value.trim() ? `${value.trimEnd()}\n${nextLine}` : nextLine);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fbfbf9] text-[#242422] dark:bg-background dark:text-foreground" aria-label={uiText("使用模板：{{ui:0}}", [templateName])}>
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[#e5e5e1] px-3 dark:border-border">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#242422] text-white dark:bg-foreground dark:text-background">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xs font-semibold" title={templateName}>{templateName}</h2>
          <p className="mt-0.5 text-[10px] text-[#85857f] dark:text-muted-foreground">{uiText("模板助手")}</p>
        </div>
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={uiText("关闭模板使用助手")} onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{uiText("关闭助手")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <TemplateBrief
        focus={focus}
        requests={requestItems}
        expanded={briefExpanded}
        onExpandedChange={setBriefExpanded}
        onRequestSelect={selectRequest}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-3 py-3">
          <div className="space-y-3" role="log" aria-live="polite">
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                <div className={cn("min-w-0 max-w-full", isUser ? "max-w-[88%] sm:max-w-[84%]" : "w-full")}>
                  <div className={cn(
                    "whitespace-pre-wrap break-words text-xs leading-5 [overflow-wrap:anywhere]",
                    isUser
                      ? "rounded-lg bg-[#e9e9e5] px-3 py-2 text-[#30302d] dark:bg-accent dark:text-accent-foreground"
                      : "pr-2 text-[#3f3f3b] dark:text-foreground/90",
                    message.tone === "error" && "text-destructive"
                  )}>
                    {message.streaming && !message.content ? (
                      <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className={cn("h-3.5 w-3.5", !reduceMotion && "animate-spin")} />{uiText("正在理解模板与需求…")}</span>
                    ) : message.content}
                  </div>
                </div>
              </div>
            );
          })}
          </div>

          {!latestPrompt && !streaming ? (
            <section className="mt-4" aria-label={uiText("建议的下一步")}>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-[10px] font-medium text-[#85857f] dark:text-muted-foreground">{uiText("快捷操作")}</p>
              {suggestionsLoading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" disabled={suggestionsLoading} onClick={onRefreshSuggestions} className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" aria-label={uiText("换一组模板使用建议")}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{uiText("换一组建议")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="overflow-hidden rounded-md border border-[#e1e1dc] bg-white dark:border-border dark:bg-card">
              {visibleSuggestions.slice(0, 2).map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestionSelect(suggestion)}
                  className={cn("group flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] leading-4 text-[#555550] transition-colors hover:bg-[#f3f3f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:text-foreground/85 dark:hover:bg-accent", index > 0 && "border-t border-[#e8e8e4] dark:border-border")}
                >
                  <span className="min-w-0 flex-1 line-clamp-2 break-words [overflow-wrap:anywhere]" title={suggestion}>{suggestion}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[#aaa9a3] transition-transform group-hover:translate-x-0.5 dark:text-muted-foreground" />
                </button>
              ))}
            </div>
            </section>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {latestPrompt && latestPrompt !== dismissedPrompt && !streaming ? (
            <PromptProposal
              key={latestPrompt}
              prompt={latestPrompt}
              canGenerateImmediately={canGenerateImmediately}
              onApply={onApplyPrompt}
              onGenerate={onGeneratePrompt}
              onDismiss={() => setDismissedPrompt(latestPrompt)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-[#e5e5e1] bg-white p-2.5 dark:border-border dark:bg-background">
        {contextImages.length > 0 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto" aria-label={uiText("本次参考图片")}>
            {contextImages.map((image) => (
              <div key={image.id} className="group relative h-9 w-9 shrink-0 overflow-hidden rounded border border-[#d9d9d4] dark:border-border">
                <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
                {image.onRemove ? (
                  <button type="button" onClick={image.onRemove} aria-label={uiText("移除{{ui:0}}", [image.alt])} className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none">
                    <X className="h-2.5 w-2.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="rounded-md border border-[#cfcfca] bg-[#fbfbf9] p-1 shadow-sm focus-within:border-[#999993] focus-within:ring-2 focus-within:ring-[#747470]/15 dark:border-border dark:bg-card dark:focus-within:ring-ring/25">
          <textarea
            ref={inputRef}
            autoFocus
            value={value}
            rows={1}
            aria-label={uiText("描述这次如何使用模板")}
            placeholder={uiText("描述本次要生成的内容…")}
            className="max-h-24 min-h-9 w-full resize-none break-words bg-transparent px-2 py-1.5 text-xs leading-5 outline-none [overflow-wrap:anywhere] placeholder:text-[#999993] dark:placeholder:text-muted-foreground"
            onChange={(event) => onValueChange(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (!isSendEnter(event)) return;
              event.preventDefault();
              submit();
            }}
          />
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={onAttach} className="flex h-8 w-8 items-center justify-center rounded-md text-[#777772] hover:bg-[#ecece8] hover:text-[#30302d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground" aria-label={uiText("添加参考图")}>
                    {contextImages.length > 0 ? <ImagePlus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{uiText("添加参考图")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="ml-1 min-w-0 flex-1 truncate text-[10px] text-[#999993] dark:text-muted-foreground">{uiText("自动沿用模板")}</span>
            <button
              type="button"
              disabled={!streaming && !canSubmit}
              onClick={streaming ? onStop : submit}
              aria-label={streaming ? uiText("停止整理") : uiText("发送给模板使用助手")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#30302d] text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:bg-[#b8b8b2] dark:bg-foreground dark:text-background"
            >
              {streaming ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
