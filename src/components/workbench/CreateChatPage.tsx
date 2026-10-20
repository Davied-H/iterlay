import { getUiTextLocale } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  X
} from "lucide-react";
import { Streamdown } from "streamdown";
import type {
  AssistantConversationMessage,
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  SceneAssistantInteraction,
  ProviderConfig
} from "@shared/types";
import { getProviderModels } from "@shared/provider-models";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formatAssistantInteractionAnswers } from "@/lib/assistant-interaction";
import { buildAssistantHistory, type AssistantHistoryConversation } from "@/lib/assistant-history";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { sceneAssistantFieldsToPrompt } from "@/lib/prompt-assistant";
import { cn } from "@/lib/utils";
import { isSendEnter } from "@/lib/send-on-enter";
import { CreatePlanCard, CreateQuestionCard } from "./CreateChatCards";
import "./CreateChatPage.css";

const HISTORY_MASK_VARIANTS = {
  closed: { opacity: 0 },
  open: { opacity: 1 }
} as const;

const HISTORY_DRAWER_VARIANTS = {
  closed: { x: "100%" },
  open: { x: 0 }
} as const;

export interface CreateChatResult {
  boardId: string;
  comicDrama?: boolean;
  boardName: string;
  images: Array<{ id: string; dataUrl: string }>;
}

export interface CreateChatGenerationPlan {
  prompt: string;
  targetBoardId: string | null;
  conversationId: string;
  suggestedName?: string;
  comicDrama?: boolean;
}

interface CreateChatPageProps {
  boards: BoardSummary[];
  activeBoardId?: string;
  canUseAgent?: boolean;
  imageProviders?: ProviderConfig[];
  activeImageProviderId?: string;
  activeImageModel?: string;
  onSelectImageModel?: (providerId: string, model: string) => void;
  onInterpret: (request: CollaborateSceneRequest) => Promise<CollaborateSceneResult>;
  onCreate: (plan: CreateChatGenerationPlan) => Promise<CreateChatResult>;
  onOpenBoard: (boardId: string) => void;
  onOpenSettings: () => void;
}

type CreateChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      result: CollaborateSceneResult;
      prompt: string;
      comicDrama?: boolean;
      confirmed?: boolean;
      historical?: boolean;
    }
  | { id: string; role: "result"; prompt: string; result: CreateChatResult }
  | { id: string; role: "error"; content: string; retryInstruction?: string; retryMessageId?: string };

type QuestionInteraction = Extract<SceneAssistantInteraction, { type: "form" }>;

export function isComicDramaIdea(value: string): boolean {
  return /漫剧|漫画短剧|动态漫|分镜|片段脚本|角色卡|连续剧情/u.test(value);
}

const FALLBACK_STARTER_PROMPTS = [
  "一组克制高级的香水产品摄影，深色背景与硬光",
  "为一款独立咖啡品牌设计三张社交媒体视觉",
  "创建一组未来感建筑概念图，清晨薄雾与自然材质"
] as const;

export function CreateChatPage({
  boards,
  activeBoardId,
  canUseAgent = true,
  imageProviders = [],
  activeImageProviderId,
  activeImageModel,
  onSelectImageModel,
  onInterpret,
  onCreate,
  onOpenBoard,
  onOpenSettings
}: CreateChatPageProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const [value, setValue] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [targetBoardId, setTargetBoardId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CreateChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [clarificationRounds, setClarificationRounds] = useState(0);
  const [interpreting, setInterpreting] = useState(false);
  const [generatingMessageId, setGeneratingMessageId] = useState<string | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyConversations, setHistoryConversations] = useState<AssistantHistoryConversation[]>([]);
  const [starterPrompts, setStarterPrompts] = useState<string[]>([...FALLBACK_STARTER_PROMPTS]);
  const [starterPromptsLoading, setStarterPromptsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const followScrollRef = useRef(true);
  const requestVersionRef = useRef(0);
  const starterPromptsRequestRef = useRef(0);
  const restoreWithoutScrollAnimationRef = useRef(false);
  const skipNextSmoothScrollRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === targetBoardId) ?? null,
    [boards, targetBoardId]
  );
  const busy = interpreting || Boolean(generatingMessageId);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const scroll = scrollRef.current;
      if (scroll && followScrollRef.current) scroll.scrollTop = scroll.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [messages.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = window.setTimeout(() => setCopiedMessageId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedMessageId]);

  const loadStarterPrompts = useCallback(async (
    suggestionMode: "contextual" | "divergent",
    previousSuggestions: string[] = []
  ): Promise<void> => {
    if (!canUseAgent) {
      setStarterPrompts([...FALLBACK_STARTER_PROMPTS]);
      return;
    }
    const requestId = starterPromptsRequestRef.current + 1;
    starterPromptsRequestRef.current = requestId;
    setStarterPromptsLoading(true);
    try {
      const result = await getImageWorkbenchApi().suggestAssistantIntents({
        assistantSurface: "canvas-prompt",
        conversation: [],
        currentFields: [],
        referenceImageCount: 0,
        suggestionCount: 3,
        suggestionMode,
        previousSuggestions,
        variationSeed: crypto.randomUUID()
      });
      if (starterPromptsRequestRef.current !== requestId) return;
      const suggestions = [...new Set(
        result.suggestions.map((suggestion) => suggestion.trim()).filter(Boolean)
      )].slice(0, 3);
      if (suggestions.length === 3) setStarterPrompts(suggestions);
    } catch {
      // Keep the local starters when the dedicated suggestion agent is unavailable.
    } finally {
      if (starterPromptsRequestRef.current === requestId) setStarterPromptsLoading(false);
    }
  }, [canUseAgent]);

  useEffect(() => {
    if (targetBoardId && !selectedBoard) setTargetBoardId(null);
  }, [selectedBoard, targetBoardId]);

  useEffect(() => {
    void loadStarterPrompts("contextual");
  }, [conversationId, loadStarterPrompts]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || restoreWithoutScrollAnimationRef.current || !followScrollRef.current) return;
    if (skipNextSmoothScrollRef.current) {
      skipNextSmoothScrollRef.current = false;
      return;
    }
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, interpreting, generatingMessageId, reduceMotion]);

  useLayoutEffect(() => {
    if (!restoreWithoutScrollAnimationRef.current) return;
    const element = scrollRef.current;
    restoreWithoutScrollAnimationRef.current = false;
    skipNextSmoothScrollRef.current = true;
    if (!element) return;
    const previousScrollBehavior = element.style.scrollBehavior;
    element.style.scrollBehavior = "auto";
    element.scrollTop = element.scrollHeight;
    element.style.scrollBehavior = previousScrollBehavior;
  }, [messages]);

  useEffect(() => {
    if (!historyOpen) return;
    const previousFocus = document.activeElement;
    historyCloseButtonRef.current?.focus({ preventScroll: true });
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setHistoryOpen(false);
      if (event.key !== "Tab") return;
      const dialog = historyCloseButtonRef.current?.closest("aside");
      const buttons = dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [historyOpen]);

  function resetConversation(): void {
    requestVersionRef.current += 1;
    followScrollRef.current = true;
    setShowScrollButton(false);
    setMessages([]);
    setValue("");
    setEditingMessageId(null);
    setTargetBoardId(null);
    setConversationId(crypto.randomUUID());
    setClarificationRounds(0);
    setInterpreting(false);
    setGeneratingMessageId(null);
    setGenerationStartedAt(null);
    setActiveDecisionId(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function openHistory(): Promise<void> {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const records = await getImageWorkbenchApi().listAssistantConversations({
        surface: "canvas-prompt"
      });
      const boardNames = new Map(boards.map((board) => [board.id, board.name]));
      setHistoryConversations(buildAssistantHistory(records, boardNames));
    } catch (error) {
      setHistoryConversations([]);
      setHistoryError(getWorkbenchErrorMessage(error, "无法读取会话历史。"));
    } finally {
      setHistoryLoading(false);
    }
  }

  function restoreConversation(conversation: AssistantHistoryConversation): void {
    requestVersionRef.current += 1;
    followScrollRef.current = true;
    setShowScrollButton(false);
    restoreWithoutScrollAnimationRef.current = true;
    setConversationId(conversation.id);
    setMessages(conversation.messages.map((message): CreateChatMessage => {
      if (message.role === "user") {
        return { id: message.id, role: "user", content: message.content };
      }
      const prompt = message.generatedPrompt?.trim() ?? "";
      return {
        id: message.id,
        role: "assistant",
        content: message.content,
        result: {
          message: message.content,
          intent: prompt ? "direct" : "chat",
          fields: prompt ? [{ label: "提示词", value: prompt }] : []
        },
        prompt,
        historical: true
      };
    }));
    setTargetBoardId(
      conversation.boardId && boards.some((board) => board.id === conversation.boardId)
        ? conversation.boardId
        : null
    );
    setValue("");
    setEditingMessageId(null);
    setClarificationRounds(0);
    setInterpreting(false);
    setGeneratingMessageId(null);
    setGenerationStartedAt(null);
    setActiveDecisionId(null);
    setHistoryOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }

  function conversationBeforeCurrentTurn(history: CreateChatMessage[]): AssistantConversationMessage[] {
    return history.flatMap((message): AssistantConversationMessage[] => {
      if (message.role === "user") return [{ role: "user", content: message.content }];
      if (message.role === "assistant") return [{ role: "assistant", content: message.content }];
      return [];
    }).slice(-16);
  }

  async function interpret(instructionValue: string, displayContent = instructionValue): Promise<void> {
    const instruction = instructionValue.trim();
    if (!instruction || busy) return;
    if (!canUseAgent) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "error", content: "Pi Agent 尚未配置，请先设置文本模型。" }
      ]);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    followScrollRef.current = true;
    const editIndex = messages.findIndex((message) => message.id === editingMessageId && message.role === "user");
    const priorMessages = editIndex < 0 ? messages : messages.slice(0, editIndex);
    const priorConversation = conversationBeforeCurrentTurn(priorMessages);
    setMessages([
      ...priorMessages,
      { id: crypto.randomUUID(), role: "user", content: displayContent }
    ]);
    setValue("");
    setEditingMessageId(null);
    setActiveDecisionId(null);
    setInterpreting(true);

    try {
      const result = await onInterpret({
        instruction,
        referenceImages: [],
        currentFields: selectedBoard
          ? [{ label: "目标画板", value: selectedBoard.name }]
          : [],
        generationSettings: { count: 1, maxCount: 1 },
        clarificationRounds: editIndex < 0 ? clarificationRounds : 0,
        conversation: priorConversation,
        conversationId,
        assistantSurface: "canvas-prompt",
        memoryQuery: targetBoardId ? { boardId: targetBoardId } : undefined,
        workflowMode: "generate"
      });
      if (requestVersionRef.current !== requestVersion) return;

      const prompt = result.intent === "chat"
        ? ""
        : sceneAssistantFieldsToPrompt(result.fields) || result.detailedPrompt?.trim() || "";
      const assistantMessage: Extract<CreateChatMessage, { role: "assistant" }> = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.message,
        result,
        prompt,
        comicDrama: isComicDramaIdea([instruction, result.suggestedName, ...result.fields.map((field) => field.value)].filter(Boolean).join(" "))
      };
      setMessages((current) => [...current, assistantMessage]);
      if (result.interaction?.type === "form") {
        setClarificationRounds((current) => current + 1);
        setActiveDecisionId(assistantMessage.id);
      } else if (prompt) {
        setClarificationRounds(0);
        setActiveDecisionId(assistantMessage.id);
      } else {
        setClarificationRounds(0);
      }
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: error instanceof Error ? error.message : "Pi Agent 暂时不可用，请稍后重试。",
          retryInstruction: instruction
        }
      ]);
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setInterpreting(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }

  async function submit(): Promise<void> {
    await interpret(value);
  }

  async function confirmGeneration(
    message: Extract<CreateChatMessage, { role: "assistant" }>
  ): Promise<void> {
    if (!message.prompt || message.id !== activeDecisionId || busy) return;
    const requestVersion = ++requestVersionRef.current;
    setGeneratingMessageId(message.id);
    setGenerationStartedAt(Date.now());
    try {
      const result = await onCreate({
        prompt: message.prompt,
        targetBoardId,
        conversationId,
        suggestedName: message.result.suggestedName,
        comicDrama: message.comicDrama
      });
      if (requestVersionRef.current !== requestVersion) return;
      setTargetBoardId(result.boardId);
      setMessages((current) => [
        ...current.map((item) => item.id === message.id ? { ...item, confirmed: true } : item),
        { id: crypto.randomUUID(), role: "result", prompt: message.prompt, result }
      ]);
      setActiveDecisionId(null);
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: error instanceof Error ? error.message : "生成失败，请稍后重试。",
          retryMessageId: message.id
        }
      ]);
      setActiveDecisionId(message.id);
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setGeneratingMessageId(null);
        setGenerationStartedAt(null);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }

  const targetLabel = selectedBoard?.name ?? "新建画板";
  const isEmpty = messages.length === 0 && !interpreting;

  async function copyMessage(id: string, content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      setCopyFailed(false);
      setCopiedMessageId(id);
    } catch {
      setCopyFailed(true);
    }
  }

  function scrollToLatest(): void {
    followScrollRef.current = true;
    setShowScrollButton(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <section className="create-chat" data-empty={isEmpty} aria-label={uiText("AI 创作")}>
      <header className="workbench-page-header create-chat-header window-titlebar-overlay-safe" inert={historyOpen}>
        <h1>{uiText("新对话")}</h1>
        <div className="create-chat-header-actions">
          <button type="button" onClick={() => void openHistory()} aria-label={uiText("查看会话历史")} title={uiText("会话历史")} className="create-chat-icon-button">
            <History size={19} strokeWidth={1.7} />
          </button>
          <button type="button" onClick={resetConversation} disabled={messages.length === 0 || busy} className="create-chat-new">
            <Pencil size={17} strokeWidth={1.7} />
            <span>{uiText("新对话")}</span>
          </button>
        </div>
      </header>

      <div className="create-chat-body" inert={historyOpen}>
        {isEmpty ? (
          <div ref={scrollRef} data-create-chat-scroll className="create-chat-empty-scroll">
            <div className="create-chat-welcome">
              <h2>{uiText("今天想创作什么？")}</h2>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="create-chat-scroll"
            data-create-chat-scroll
            onScroll={(event) => {
              const element = event.currentTarget;
              const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
              followScrollRef.current = nearBottom;
              setShowScrollButton(!nearBottom);
            }}
          >
            <div ref={threadRef} className="create-chat-thread" role="log" aria-live="polite" aria-relevant="additions text">
              {messages.map((message) => message.role === "user" ? (
                <article key={message.id} className="create-chat-user" aria-label={uiText("你")}>
                  <p>{message.content}</p>
                  <div className="create-chat-message-actions">
                    <button type="button" className="create-chat-icon-button" onClick={() => void copyMessage(message.id, message.content)} aria-label={uiText("复制消息")} title={uiText("复制消息")}>
                      {copiedMessageId === message.id ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                    <button type="button" className="create-chat-icon-button" disabled={busy} aria-label={uiText("编辑消息")} title={uiText("编辑消息")} onClick={() => { setEditingMessageId(message.id); setValue(message.content); textareaRef.current?.focus(); }}>
                      <Pencil size={16} />
                    </button>
                  </div>
                </article>
              ) : message.role === "error" ? (
                <div key={message.id} className="create-chat-error" role="alert">
                  <AlertCircle size={18} />
                  <div>
                    <p>{message.content}</p>
                    <div className="create-chat-error-actions">
                      {message.retryInstruction || message.retryMessageId === activeDecisionId ? (
                        <button type="button" disabled={busy} onClick={() => {
                          if (message.retryInstruction) void interpret(message.retryInstruction);
                          else {
                            const plan = messages.find((item) => item.id === message.retryMessageId);
                            if (plan?.role === "assistant") void confirmGeneration(plan);
                          }
                        }}><RefreshCw size={14} />{uiText("重试")}</button>
                      ) : null}
                      {!canUseAgent ? <button type="button" onClick={onOpenSettings}>{uiText("打开设置")}<ArrowUpRight size={14} /></button> : null}
                    </div>
                  </div>
                </div>
              ) : message.role === "assistant" ? (
                <article key={message.id} className="create-chat-assistant" aria-label={uiText("创作助手")}>
                  <div className="create-chat-response">
                    <Streamdown mode="static" controls={false} linkSafety={{ enabled: true }}>
                      {message.content}
                    </Streamdown>
                  </div>
                  {message.result.interaction?.type === "form" && message.id === activeDecisionId ? (
                    <CreateQuestionCard
                      interaction={message.result.interaction}
                      disabled={busy}
                      onDismiss={() => { setActiveDecisionId(null); textareaRef.current?.focus(); }}
                      onSubmit={(values) => {
                        const answers = formatAssistantInteractionAnswers(message.result.interaction as QuestionInteraction, values);
                        void interpret(answers, answers);
                      }}
                    />
                  ) : message.prompt ? (
                    <CreatePlanCard
                      prompt={message.prompt}
                      targetLabel={targetLabel}
                      active={message.id === activeDecisionId}
                      confirmed={message.confirmed}
                      historical={message.historical}
                      generating={generatingMessageId === message.id}
                      disabled={busy}
                      generationStartedAt={generatingMessageId === message.id ? generationStartedAt : null}
                      comicDrama={Boolean(message.comicDrama)}
                      onRefine={() => textareaRef.current?.focus()}
                      onGenerate={() => void confirmGeneration(message)}
                    />
                  ) : null}
                  <div className="create-chat-message-actions">
                    <button type="button" className="create-chat-icon-button" onClick={() => void copyMessage(message.id, message.content)} aria-label={uiText("复制回复")} title={uiText("复制回复")}>
                      {copiedMessageId === message.id ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </article>
              ) : (
                <article key={message.id} className="create-chat-result" aria-label={uiText("创作结果")}>
                  {message.result.images.length > 0 ? (
                    <div className="create-chat-result-images" data-single={message.result.images.length === 1}>
                      {message.result.images.map((image, index) => (
                        <button key={image.id} type="button" onClick={() => onOpenBoard(message.result.boardId)} aria-label={uiText("打开画板查看第 {{ui:0}} 张生成图片", [index + 1])}>
                          <img src={image.dataUrl} alt={uiText("生成结果 {{ui:0}}", [index + 1])} />
                          <span className="create-chat-image-open"><ArrowUpRight size={18} /></span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="create-chat-result-note">
                      <ImageIcon size={20} />
                      <p>{message.result.comicDrama
                        ? uiText("已添加 1 张漫剧设定卡，并打开通用漫剧助手。本步未创建角色、片段或媒体节点，不产生媒体费用。")
                        : uiText("没有生成可用图片，请检查模型配置后重试。")}</p>
                    </div>
                  )}
                  <div className="create-chat-result-footer">
                    <p><Check size={15} /><span>{message.result.comicDrama ? uiText("已在普通画板中开始") : uiText("已生成并保存到")}「{message.result.boardName}」</span></p>
                    <button type="button" onClick={() => onOpenBoard(message.result.boardId)}>{uiText("打开画板")}<ArrowUpRight size={15} /></button>
                  </div>
                </article>
              ))}
              {interpreting ? (
                <div className="create-chat-thinking" role="status">
                  <span className="create-chat-thinking-dot" />
                  <span>{uiText("正在构思…")}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="create-chat-compose-area">
          {showScrollButton && !isEmpty ? (
            <button type="button" className="create-chat-jump" aria-label={uiText("回到最新消息")} onClick={scrollToLatest}><ArrowDown size={18} /></button>
          ) : null}
          <div className="create-chat-composer" data-busy={busy}>
            {editingMessageId ? (
              <div className="create-chat-editing">
                <span><Pencil size={14} />{uiText("编辑消息")}</span>
                <button type="button" aria-label={uiText("取消编辑")} onClick={() => { setEditingMessageId(null); setValue(""); textareaRef.current?.focus(); }}><X size={15} /></button>
              </div>
            ) : null}
            <label className="sr-only" htmlFor="create-chat-input">{uiText("描述想要创建的内容")}</label>
            <textarea
              ref={textareaRef}
              id="create-chat-input"
              value={value}
              rows={1}
              autoFocus
              disabled={busy}
              placeholder={isEmpty ? uiText("描述你想创作的内容…") : uiText("继续补充或调整创作想法…")}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (!isSendEnter(event)) return;
                event.preventDefault();
                void submit();
              }}
            />
            <div className="create-chat-composer-toolbar">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={busy} className="create-chat-target">
                    {selectedBoard ? <LayoutGrid size={18} strokeWidth={1.7} /> : <Plus size={20} strokeWidth={1.7} />}
                    <span>{uiText(targetLabel)}</span>
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={10} className="w-64 rounded-xl p-1.5">
                  <DropdownMenuLabel>{uiText("生成到")}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setTargetBoardId(null)}>
                    <Plus className="h-4 w-4" />
                    <span className="flex-1">{uiText("新建画板")}</span>
                    {!targetBoardId ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenuItem>
                  {boards.length > 0 ? <DropdownMenuSeparator /> : null}
                  {boards.map((board) => (
                    <DropdownMenuItem key={board.id} onSelect={() => setTargetBoardId(board.id)}>
                      <LayoutGrid className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{board.name}</span>
                      {targetBoardId === board.id ? <Check className="h-4 w-4" /> : null}
                      {board.id === activeBoardId && targetBoardId !== board.id ? <span className="text-[10px] text-muted-foreground">{uiText("当前")}</span> : null}
                    </DropdownMenuItem>
                  ))}
                  {boards.length === 0 ? <DropdownMenuItem onSelect={onOpenSettings}>{uiText("生成后可在画板库中继续整理")}</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={busy} className="create-chat-model" aria-label={uiText("选择图片模型")}>
                    <span>{activeImageModel || imageProviders.find((provider) => provider.id === activeImageProviderId)?.model || uiText("选择图片模型")}</span>
                    <ChevronDown size={13} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={10} className="create-chat-model-menu w-64 max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>{uiText("图片模型")}</DropdownMenuLabel>
                  {imageProviders.map((provider) => <DropdownMenuGroup key={provider.id}>
                    <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
                    {getProviderModels(provider).map((model) => <DropdownMenuItem key={model}
                      onSelect={() => onSelectImageModel?.(provider.id, model)}>
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                      {provider.id === activeImageProviderId && model === (activeImageModel || provider.model) ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </DropdownMenuItem>)}
                  </DropdownMenuGroup>)}
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup><DropdownMenuItem onSelect={onOpenSettings}>{uiText("管理模型")}</DropdownMenuItem></DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <button type="button" onClick={() => void submit()} disabled={!value.trim() || busy} aria-label={uiText("发送给 Pi Agent")} title={uiText("发送消息")} className="create-chat-send">
                {busy ? <Loader2 size={19} className="animate-spin motion-reduce:animate-none" /> : <ArrowUp size={21} strokeWidth={2} />}
              </button>
            </div>
          </div>
          <p className="create-chat-composer-hint" role="status">{copyFailed ? uiText("复制失败，请选择文字后手动复制。") : copiedMessageId ? uiText("已复制") : uiText("Enter 发送，Shift + Enter 换行")}</p>
        </div>

        {isEmpty ? (
          <div className="create-chat-starters" aria-busy={starterPromptsLoading}>
            <div className="create-chat-starter-list">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => { setValue(prompt); textareaRef.current?.focus(); }}>{prompt}<ArrowUpRight size={15} /></button>
              ))}
            </div>
            <button type="button" onClick={() => void loadStarterPrompts("divergent", starterPrompts)} disabled={starterPromptsLoading} aria-label={uiText("换一批灵感")} className="create-chat-refresh">
              <RefreshCw size={14} className={cn(starterPromptsLoading && "animate-spin motion-reduce:animate-none")} />{uiText("换一批")}
            </button>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {historyOpen ? (
          <>
            <motion.button
              type="button"
              aria-label={uiText("关闭会话历史")}
              className="absolute inset-0 z-40 bg-black/20 [-webkit-app-region:no-drag]"
              variants={HISTORY_MASK_VARIANTS}
              initial={reduceMotion ? false : "closed"}
              animate="open"
              exit="closed"
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              onClick={() => setHistoryOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={uiText("会话历史")}
              className="absolute inset-y-0 right-0 z-50 flex w-[min(380px,calc(100%-24px))] flex-col border-l border-border bg-background shadow-[-18px_0_44px_rgba(0,0,0,0.12)] [-webkit-app-region:no-drag]"
              variants={HISTORY_DRAWER_VARIANTS}
              initial={reduceMotion ? false : "closed"}
              animate="open"
              exit="closed"
              transition={reduceMotion
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <div>
                  <h2 className="text-sm font-semibold">{uiText("会话历史")}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{uiText("选择一条记录继续创作")}</p>
                </div>
                <button
                  ref={historyCloseButtonRef}
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label={uiText("关闭会话历史")}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {historyLoading ? (
                  <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    {uiText("正在读取历史…")}</div>
                ) : historyError ? (
                  <div className="m-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                    <p>{historyError}</p>
                    <button
                      type="button"
                      onClick={() => void openHistory()}
                      className="mt-2 h-8 rounded-md border border-destructive/25 px-2.5 text-xs font-medium hover:bg-destructive/10"
                    >
                      {uiText("重新加载")}</button>
                  </div>
                ) : historyConversations.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center px-8 text-center">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">{uiText("暂无会话历史")}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("完成一次与 Pi Agent 的对话后，记录会显示在这里。")}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {historyConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => restoreConversation(conversation)}
                        aria-label={uiText("打开会话：{{ui:0}}", [conversation.title])}
                        className={cn(
                          "group w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          conversation.id === conversationId && "bg-accent/70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.title}</span>
                          <time className="shrink-0 text-[10px] text-muted-foreground">
                            {formatHistoryTime(conversation.updatedAt)}
                          </time>
                        </div>
                        {conversation.preview ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{conversation.preview}</p>
                        ) : null}
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {conversation.boardName ? <span className="max-w-40 truncate">{conversation.boardName}</span> : null}
                          <span>{conversation.exchangeCount} {uiText("轮")}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen(false);
                    resetConversation();
                  }}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {uiText("新建对话")}</button>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function formatHistoryTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(getUiTextLocale(), sameDay
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "numeric", day: "numeric" }
  ).format(date);
}
