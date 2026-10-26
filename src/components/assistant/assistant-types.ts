import type { ReactNode } from "react";
import type {
  CollaborateSceneResult,
  AssistantIntentSuggestionCount,
  BoardMutationPlan,
  SceneAssistantInteraction,
} from "@shared/types";
import type {
  AssistantAttachmentSnapshot,
  AssistantToolCall,
} from "@shared/assistant-display";
import type { AssistantConfirmationPreview } from "@/lib/assistant-interaction";
import type { AssistantHistoryConversation } from "@/lib/assistant-history";

export interface AiAssistantReceiptAction {
  label: string;
  /** undo 显示撤销图标，toggle 显示切换图标；缺省不带图标。 */
  kind?: "undo" | "toggle";
  onAction: () => void;
}

export interface AiAssistantReceipt {
  label: string;
  actions?: AiAssistantReceiptAction[];
}

export interface AiAssistantMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  reasoningSummary?: string;
  attachments?: AssistantAttachmentSnapshot[];
  toolCalls?: AssistantToolCall[];
  streaming?: boolean;
  tone?: "default" | "error";
  receipt?: AiAssistantReceipt;
  /** 仅发送给后续模型轮次的完整上下文，不在气泡中展示。 */
  assistantContext?: string;
  /** 本轮实际生成的完整提示词，默认折叠供回顾与复用。 */
  generatedPrompt?: string;
  mediaType?: CollaborateSceneResult["mediaType"];
  videoSettings?: CollaborateSceneResult["videoSettings"];
  directions?: AiAssistantDirection[];
  onGenerateAllDirections?: () => void;
  comicDramaPlan?: AiAssistantComicDramaPlan;
}

export interface AiAssistantComicDramaPlan {
  plan: BoardMutationPlan;
  contextLabel: string;
  readiness?: string;
  status: "preview" | "applying" | "applied" | "conflict" | "error";
  error?: string;
  onApply: (characterDraftIds?: string[]) => void;
  onRefine: () => void;
  onRetry: () => void;
}

export interface AiAssistantDirection {
  id: string;
  title: string;
  description?: string;
  onApply: () => void;
  onGenerate: () => void;
}

export interface AiAssistantInteractionState {
  id: string;
  interaction: SceneAssistantInteraction;
  confirmationPreview?: AssistantConfirmationPreview;
  canGenerateImmediately?: boolean;
}

export interface AiAssistantWorkflowStep {
  id: string;
  label: string;
  detail?: string;
  result?: string;
  streaming?: boolean;
  status: "pending" | "active" | "complete" | "error";
}

export interface AiAssistantWorkflowAction {
  id: string;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  onAction: () => void;
}

export interface AiAssistantWorkflow {
  label?: string;
  steps: AiAssistantWorkflowStep[];
  actions?: AiAssistantWorkflowAction[];
  notice?: string;
}

export type AiAssistantInteractionValues = Record<string, string | string[]>;
export type AiAssistantResizeCorner = "nw" | "ne" | "sw" | "se";

export interface AiAssistantResizeHandlers {
  onPointerDown: (
    corner: AiAssistantResizeCorner,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export interface AiAssistantContextImage {
  id: string;
  src: string;
  alt: string;
  role: "edit-target" | "reference";
  onRemove?: () => void;
}

export interface AiAssistantProps {
  hideComposer?: boolean;
  hideInteraction?: boolean;
  variant: "docked" | "floating";
  dockSide?: "left" | "right";
  title?: string;
  subtitle?: string;
  /** 用于嵌入已有页面标题/标签的助手视图。 */
  hideHeader?: boolean;
  messages: AiAssistantMessage[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean;
  activityLabel?: string;
  interaction?: AiAssistantInteractionState | null;
  workflow?: AiAssistantWorkflow;
  /** 调用方控制是否展示意图建议；开关应放在所属业务的设置中。 */
  intentSuggestionsEnabled?: boolean;
  intentSuggestionCount?: AssistantIntentSuggestionCount;
  intentSuggestions?: string[];
  intentSuggestionsLoading?: boolean;
  contextImages?: AiAssistantContextImage[];
  history?: AssistantHistoryConversation[];
  historyLoading?: boolean;
  historyScope?: "board" | "all";
  currentConversationId?: string;
  compact?: boolean;
  composerAutoFocus?: boolean;
  /** 在输入区提供全画板层级的大尺寸编辑弹窗。 */
  expandableComposer?: boolean;
  canSubmitWithoutText?: boolean;
  resizePointerHandlers?: AiAssistantResizeHandlers;
  headerPointerHandlers?: Pick<
    React.HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
  headerActions?: ReactNode;
  className?: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onClose?: () => void;
  onAttach?: () => void;
  onPasteImages?: (files: File[]) => void;
  onIntentSuggestionSelect?: (suggestion: string) => void;
  onRefreshIntentSuggestions?: () => void;
  onInteractionSubmit?: (values: AiAssistantInteractionValues) => void;
  onInteractionDismiss?: () => void;
  onInteractionRefine?: (value: string) => void;
  onInteractionGenerate?: () => void;
  onHistoryOpen?: () => void;
  onHistoryScopeChange?: (scope: "board" | "all") => void;
  onHistorySelect?: (conversation: AssistantHistoryConversation) => void;
  onNewConversation?: () => void;
  onApplyGeneratedPrompt?: (prompt: string, message?: AiAssistantMessage) => void;
}
