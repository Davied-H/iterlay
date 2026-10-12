import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X
} from "lucide-react";
import type {
  AssistantConversationMessage,
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  SceneAssistantInteraction
} from "@shared/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formatAssistantInteractionAnswers } from "@/lib/assistant-interaction";
import {
  buildAssistantHistory,
  type AssistantHistoryConversation
} from "@/lib/assistant-history";
import {
  getImageWorkbenchApi,
  getWorkbenchErrorMessage
} from "@/lib/image-workbench-api";
import { sceneAssistantFieldsToPrompt } from "@/lib/prompt-assistant";
import { getGenerationTiming } from "@/lib/generation-timing";
import { cn } from "@/lib/utils";
import { isSendEnter } from "@/lib/send-on-enter";

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
    }
  | { id: string; role: "result"; prompt: string; result: CreateChatResult }
  | { id: string; role: "error"; content: string };

type QuestionInteraction = Extract<SceneAssistantInteraction, { type: "form" }>;
type QuestionValues = Record<string, string | string[]>;

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
  onInterpret,
  onCreate,
  onOpenBoard,
  onOpenSettings
}: CreateChatPageProps): React.ReactElement {
  const reduceMotion = Boolean(useReducedMotion());
  const [value, setValue] = useState("");
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
  const requestVersionRef = useRef(0);
  const starterPromptsRequestRef = useRef(0);
  const restoreWithoutScrollAnimationRef = useRef(false);
  const skipNextSmoothScrollRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === targetBoardId) ?? null,
    [boards, targetBoardId]
  );
  const busy = interpreting || Boolean(generatingMessageId);

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
    if (!element || restoreWithoutScrollAnimationRef.current) return;
    if (skipNextSmoothScrollRef.current) {
      skipNextSmoothScrollRef.current = false;
      return;
    }
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, interpreting, generatingMessageId]);

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
    historyCloseButtonRef.current?.focus({ preventScroll: true });
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setHistoryOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyOpen]);

  function resetConversation(): void {
    requestVersionRef.current += 1;
    setMessages([]);
    setValue("");
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
        confirmed: Boolean(prompt)
      };
    }));
    setTargetBoardId(
      conversation.boardId && boards.some((board) => board.id === conversation.boardId)
        ? conversation.boardId
        : null
    );
    setValue("");
    setClarificationRounds(0);
    setInterpreting(false);
    setGeneratingMessageId(null);
    setGenerationStartedAt(null);
    setActiveDecisionId(null);
    setHistoryOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }

  function conversationBeforeCurrentTurn(): AssistantConversationMessage[] {
    return messages.flatMap((message): AssistantConversationMessage[] => {
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
    const priorConversation = conversationBeforeCurrentTurn();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: displayContent }
    ]);
    setValue("");
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
        clarificationRounds,
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
          content: error instanceof Error ? error.message : "Pi Agent 暂时不可用，请稍后重试。"
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
      setTargetBoardId(result.boardId);
      setMessages((current) => [
        ...current.map((item) => item.id === message.id ? { ...item, confirmed: true } : item),
        { id: crypto.randomUUID(), role: "result", prompt: message.prompt, result }
      ]);
      setActiveDecisionId(null);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: error instanceof Error ? error.message : "生成失败，请稍后重试。"
        }
      ]);
      setActiveDecisionId(message.id);
    } finally {
      setGeneratingMessageId(null);
      setGenerationStartedAt(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  const targetLabel = selectedBoard?.name ?? "新建画板";
  const isEmpty = messages.length === 0 && !interpreting;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background" aria-label="AI 创作">
      <header className="window-titlebar-overlay-safe flex h-14 shrink-0 items-center justify-between px-5 [-webkit-app-region:drag]">
        <div className="min-w-0 [-webkit-app-region:no-drag]">
          <h1 className="truncate text-sm font-semibold">新对话</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <button
            type="button"
            onClick={() => void openHistory()}
            aria-label="查看会话历史"
            title="会话历史"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetConversation}
            disabled={messages.length === 0 || busy}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5" />
            新对话
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-44">
        <div className={cn("mx-auto w-full max-w-4xl", isEmpty ? "flex min-h-full flex-col items-center justify-center py-16" : "py-8")}>
          {isEmpty ? (
            <>
              <h2 className="text-center text-2xl font-semibold">今天想创作什么？</h2>
              <div className="mt-8 flex w-full max-w-2xl items-center justify-end">
                <button
                  type="button"
                  onClick={() => void loadStarterPrompts("divergent", starterPrompts)}
                  disabled={starterPromptsLoading}
                  aria-label="换一批灵感"
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", starterPromptsLoading && "animate-spin motion-reduce:animate-none")} />
                  换一批
                </button>
              </div>
              <div className="mt-2 grid w-full max-w-2xl gap-2 sm:grid-cols-3" aria-busy={starterPromptsLoading}>
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setValue(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="min-h-24 rounded-lg border border-border bg-card px-4 py-3 text-left text-xs leading-5 text-muted-foreground transition-[border-color,background-color,color] hover:border-foreground/25 hover:bg-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-8" aria-live="polite">
              {messages.map((message) => message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[min(34rem,82%)] whitespace-pre-wrap rounded-lg bg-foreground px-4 py-2.5 text-sm leading-6 text-background">
                    {message.content}
                  </p>
                </div>
              ) : message.role === "error" ? (
                <div key={message.id} className="flex max-w-xl items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {message.content}
                </div>
              ) : message.role === "assistant" ? (
                <article key={message.id} className="max-w-2xl">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-muted/55">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.content}</p>
                      {message.result.interaction?.type === "form" && message.id === activeDecisionId ? (
                        <CreateQuestionCard
                          interaction={message.result.interaction}
                          disabled={busy}
                          onDismiss={() => {
                            setActiveDecisionId(null);
                            requestAnimationFrame(() => textareaRef.current?.focus());
                          }}
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
                          generating={generatingMessageId === message.id}
                          generationStartedAt={generatingMessageId === message.id ? generationStartedAt : null}
                          comicDrama={Boolean(message.comicDrama)}
                          onRefine={() => {
                            textareaRef.current?.focus();
                          }}
                          onGenerate={() => void confirmGeneration(message)}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              ) : (
                <article key={message.id} className="max-w-3xl">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-background">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {message.result.comicDrama ? "已在普通画板中开始" : "已生成并保存到"}「{message.result.boardName}」
                  </div>
                  {message.result.images.length > 0 ? (
                    <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
                      {message.result.images.map((image, index) => (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() => onOpenBoard(message.result.boardId)}
                          aria-label={`打开画板查看第 ${index + 1} 张生成图片`}
                          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <img src={image.dataUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025] motion-reduce:transition-none" />
                        </button>
                      ))}
                    </div>
                  ) : message.result.comicDrama ? (
                    <div className="max-w-xl rounded-lg border border-border bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
                      已添加 1 张漫剧设定卡，并打开通用漫剧助手。本步未创建角色、片段或媒体节点，不产生媒体费用。
                    </div>
                  ) : (
                    <div className="flex max-w-xl items-center gap-3 rounded-lg border border-border bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4 shrink-0" />
                      没有生成可用图片，请检查模型配置后重试。
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenBoard(message.result.boardId)}
                    className="mt-3 flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    打开画板
                  </button>
                </article>
              ))}
              {interpreting ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Pi Agent 正在理解创作意图…
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-5 pt-14 sm:px-8">
        <div className="pointer-events-auto mx-auto w-full max-w-4xl rounded-xl border border-border bg-card shadow-[0_12px_36px_rgba(0,0,0,0.10)]">
          <label className="sr-only" htmlFor="create-chat-input">描述想要创建的内容</label>
          <textarea
            ref={textareaRef}
            id="create-chat-input"
            value={value}
            rows={2}
            autoFocus
            disabled={busy}
            placeholder={messages.length === 0 ? "描述你想创作的内容…" : "继续补充或调整创作想法…"}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (!isSendEnter(event)) return;
              event.preventDefault();
              void submit();
            }}
            className="block max-h-40 min-h-[72px] w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 disabled:cursor-wait"
          />
          <div className="flex h-11 items-center justify-between gap-3 px-2 pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="flex h-8 min-w-0 max-w-[70%] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {selectedBoard ? <LayoutGrid className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{targetLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-64">
                <DropdownMenuLabel>生成到</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setTargetBoardId(null)}>
                  <Plus className="h-4 w-4" />
                  <span className="flex-1">新建画板</span>
                  {!targetBoardId ? <Check className="h-4 w-4" /> : null}
                </DropdownMenuItem>
                {boards.length > 0 ? <DropdownMenuSeparator /> : null}
                {boards.map((board) => (
                  <DropdownMenuItem key={board.id} onSelect={() => setTargetBoardId(board.id)}>
                    <LayoutGrid className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{board.name}</span>
                    {targetBoardId === board.id ? <Check className="h-4 w-4" /> : null}
                    {board.id === activeBoardId && targetBoardId !== board.id ? (
                      <span className="text-[10px] text-muted-foreground">当前</span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
                {boards.length === 0 ? (
                  <DropdownMenuItem onSelect={onOpenSettings}>
                    生成后可在画板库中继续整理
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!value.trim() || busy}
              aria-label="发送给 Pi Agent"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-foreground text-background transition-[opacity,transform] hover:opacity-85 active:scale-95 disabled:pointer-events-none disabled:opacity-25 motion-reduce:transition-none"
            >
              {interpreting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {historyOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="关闭会话历史"
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
              aria-label="会话历史"
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
                  <h2 className="text-sm font-semibold">会话历史</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">选择一条记录继续创作</p>
                </div>
                <button
                  ref={historyCloseButtonRef}
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="关闭会话历史"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {historyLoading ? (
                  <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    正在读取历史…
                  </div>
                ) : historyError ? (
                  <div className="m-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                    <p>{historyError}</p>
                    <button
                      type="button"
                      onClick={() => void openHistory()}
                      className="mt-2 h-8 rounded-md border border-destructive/25 px-2.5 text-xs font-medium hover:bg-destructive/10"
                    >
                      重新加载
                    </button>
                  </div>
                ) : historyConversations.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center px-8 text-center">
                    <History className="h-5 w-5 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">暂无会话历史</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">完成一次与 Pi Agent 的对话后，记录会显示在这里。</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {historyConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => restoreConversation(conversation)}
                        aria-label={`打开会话：${conversation.title}`}
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
                          <span>{conversation.exchangeCount} 轮</span>
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
                  新建对话
                </button>
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
  return new Intl.DateTimeFormat("zh-CN", sameDay
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "numeric", day: "numeric" }
  ).format(date);
}

function CreateQuestionCard({
  interaction,
  disabled,
  onSubmit,
  onDismiss
}: {
  interaction: QuestionInteraction;
  disabled: boolean;
  onSubmit: (values: QuestionValues) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const [values, setValues] = useState<QuestionValues>({});
  const complete = interaction.fields.every((field) => {
    if (!field.required) return true;
    const fieldValue = values[field.id];
    return Array.isArray(fieldValue) ? fieldValue.length > 0 : Boolean(fieldValue?.trim());
  });

  function update(id: string, nextValue: string | string[]): void {
    setValues((current) => ({ ...current, [id]: nextValue }));
  }

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card" aria-label={interaction.title}>
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CircleHelp className="h-4 w-4" />
          {interaction.title}
        </div>
        {interaction.description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{interaction.description}</p>
        ) : null}
      </div>
      <div className="space-y-4 px-4 py-3">
        {interaction.fields.map((field) => {
          const fieldValue = values[field.id];
          return (
            <fieldset key={field.id} className="min-w-0">
              <legend className="mb-2 text-xs font-medium">
                {field.label}
                {!field.required ? <span className="ml-1 font-normal text-muted-foreground">可选</span> : null}
              </legend>
              {field.type === "select" ? (
                <div className="flex flex-wrap gap-2" role={field.multiple ? "group" : "radiogroup"}>
                  {(field.options ?? []).map((option) => {
                    const selected = field.multiple
                      ? Array.isArray(fieldValue) && fieldValue.includes(option.value)
                      : fieldValue === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role={field.multiple ? "checkbox" : "radio"}
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => {
                          if (!field.multiple) {
                            update(field.id, option.value);
                            return;
                          }
                          const current = Array.isArray(fieldValue) ? fieldValue : [];
                          update(
                            field.id,
                            selected ? current.filter((item) => item !== option.value) : [...current, option.value]
                          );
                        }}
                        className={cn(
                          "min-h-8 max-w-full rounded-md border px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  rows={field.type === "textarea" ? 3 : 2}
                  value={typeof fieldValue === "string" ? fieldValue : ""}
                  disabled={disabled}
                  placeholder={field.placeholder}
                  onChange={(event) => update(field.id, event.target.value)}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground/70 focus:border-foreground/35 focus:ring-2 focus:ring-ring"
                />
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {interaction.cancelLabel ?? "用文字回答"}
        </button>
        <button
          type="button"
          disabled={disabled || !complete}
          onClick={() => onSubmit(values)}
          className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-85 disabled:pointer-events-none disabled:opacity-30"
        >
          {interaction.submitLabel ?? "继续"}
        </button>
      </div>
    </section>
  );
}

function CreatePlanCard({
  prompt,
  targetLabel,
  active,
  confirmed = false,
  generating,
  generationStartedAt,
  comicDrama = false,
  onRefine,
  onGenerate
}: {
  prompt: string;
  targetLabel: string;
  active: boolean;
  confirmed?: boolean;
  generating: boolean;
  generationStartedAt: number | null;
  comicDrama?: boolean;
  onRefine: () => void;
  onGenerate: () => void;
}): React.ReactElement {
  const generationTiming = useCreateGenerationTiming(generationStartedAt);

  return (
    <section className={cn(
      "mt-4 overflow-hidden rounded-lg border bg-card",
      active ? "border-foreground/25" : "border-border opacity-70"
    )}>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            {active ? "创作方案已准备好" : confirmed ? "已执行的创作方案" : "此前的创作方案"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {active ? comicDrama ? `确认后添加到「${targetLabel}」` : `确认后生成到「${targetLabel}」` : confirmed ? comicDrama ? "已添加到画板" : "已确认生成" : "已被后续对话替代"}
          </p>
        </div>
        <span className="shrink-0 rounded border border-border bg-muted/45 px-2 py-1 text-[10px] text-muted-foreground">
          {comicDrama ? "免费落板" : "1 张"}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{prompt}</p>
      </div>
      {comicDrama ? <p className="border-t border-border/70 px-4 pt-2 text-[11px] text-muted-foreground">本步不生成图片或视频，不产生媒体费用</p> : null}
      {active ? (
        <div className="flex min-h-14 items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          {generating && comicDrama ? (
            <div className="mr-auto min-w-0 text-[11px] leading-4 text-muted-foreground" role="status" aria-live="polite">
              正在创建普通画板并添加 1 张漫剧设定卡，不会调用媒体模型。
            </div>
          ) : generating && generationTiming ? (
            <div className="mr-auto min-w-0 text-[11px] leading-4 text-muted-foreground" aria-live="polite">
              <p>
                已用 <time className="tabular-nums">{generationTiming.elapsedLabel}</time>
              </p>
              <p>
                {generationTiming.overdue ? (
                  "比预计久一点，任务仍在处理中"
                ) : (
                  <>预计剩余 <time className="tabular-nums">{generationTiming.remainingLabel}</time></>
                )}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={generating}
            onClick={onRefine}
            className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            继续调整
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={onGenerate}
            className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-85 disabled:pointer-events-none disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? comicDrama ? "正在添加…" : "正在生成" : comicDrama ? "在画板中开始" : "确认生成"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function useCreateGenerationTiming(startedAt: number | null): ReturnType<typeof getGenerationTiming> | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? null : getGenerationTiming(startedAt, now);
}
