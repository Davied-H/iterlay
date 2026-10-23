import "../assistant/assistant-chat.css";
import { useUiText } from "@/i18n";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  LogOut,
  Folder,
  MoreHorizontal,
  Search,
  PanelLeftOpen,
  Plus,
  Pencil,
  RefreshCw,
  Paperclip,
  X,
} from "lucide-react";
import {
  AssistantMessageFrame,
  AssistantResponse,
} from "../assistant/AssistantMessage";
import {
  AssistantComposerFrame,
  AssistantComposerToolbar,
} from "../assistant/AssistantComposer";
import type {
  AssistantConversationMessage,
  BoardSummary,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  SceneAssistantInteraction,
  ProviderConfig,
  AssetLibraryItem,
} from "@shared/types";
import type { SceneDefinition } from "@/lib/scene-library";
import { getProviderModels } from "@shared/provider-models";
import { getProviderMaxImageCount } from "@shared/provider-capabilities";
import { settleAssistantToolCalls, type AssistantToolCall } from "@shared/assistant-display";
import type { CreationArtifact, CreationEvent, CreationReference, CreationSession, CreationSessionMessage } from "@shared/creation-session";
import type { ReferenceImagePayload } from "@shared/types";
import { AssistantProcessDetails, AssistantToolGroup } from "../assistant/AssistantMessageDetails";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CreationArtifactPanel } from "./CreationArtifactPanel";
import "./creation-workspace.css";
import { agentMediaTaskFromTool, artifactUrl, artifactsFromBoard, mergeCreationTool } from "@/lib/creation-workspace";
import { readCreationProjects, writeCreationProjects, type CreationProject } from "@/lib/creation-projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAssistantInteractionAnswers } from "@/lib/assistant-interaction";
import {
  getImageWorkbenchApi,
  hasImageWorkbenchApi,
} from "@/lib/image-workbench-api";
import { resolveCreateChatMediaType } from "@/lib/create-chat-media";
import { sceneAssistantFieldsToPrompt } from "@/lib/prompt-assistant";
import { cn } from "@/lib/utils";
import { isSendEnter } from "@/lib/send-on-enter";
import { AssistantPermissionCard } from "@/components/assistant/AssistantPermissionCard";
import {
  CreatePlanCard,
  CreateQuestionCard,
} from "../assistant/AssistantDecisionCards";
import "@/components/assistant/conversation-theme.css";
import "../assistant/conversation.css";

export interface CreationAssistantStreamOptions {
  onDelta: (delta: string) => void;
  onActivity: (label: string) => void;
  onReasoningSummary?: (delta: string) => void;
  onTool?: (tool: AssistantToolCall) => void;
  onSteerAvailable?: (steer: (instruction: string) => Promise<boolean>) => void;
  onInteraction?: (
    interaction: SceneAssistantInteraction,
    respond: (
      action: "submit" | "dismiss",
      values?: Record<string, string | string[]>,
    ) => void,
  ) => void;
  signal: AbortSignal;
}

export interface CreationAssistantResult {
  videos?: Array<{ id: string; url: string; path?: string; nodeId?: string }>;
  videoJobId?: string;
  videoPending?: boolean;
  boardId: string;
  comicDrama?: boolean;
  boardName: string;
  images: Array<{ id: string; dataUrl: string }>;
}

export interface CreationAssistantGenerationPlan {
  mediaType?: "image" | "video";
  videoSettings?: CollaborateSceneResult["videoSettings"];
  onProgress?: (label: string) => void;
  count?: number;
  prompt: string;
  targetBoardId: string | null;
  conversationId: string;
  suggestedName?: string;
  comicDrama?: boolean;
  references?: ReferenceImagePayload[];
  referencePaths?: string[];
  editSource?: { boardId?: string; nodeId?: string; imagePath: string };
  onArtifact?: (artifact: CreationArtifact) => void;
}

interface CreationAssistantPageProps {
  boards: BoardSummary[];
  activeBoardId?: string;
  canUseAgent?: boolean;
  imageProviders?: ProviderConfig[];
  scenes?: SceneDefinition[];
  activeImageProviderId?: string;
  activeImageModel?: string;
  activeVideoModelLabel?: string;
  onSelectImageModel?: (providerId: string, model: string) => void;
  onInterpret: (
    request: CollaborateSceneRequest,
    stream?: CreationAssistantStreamOptions,
  ) => Promise<CollaborateSceneResult>;
  onCreate: (plan: CreationAssistantGenerationPlan) => Promise<CreationAssistantResult>;
  onOpenBoard: (boardId: string) => void;
  onOpenCreationConversation?: (conversationId: string, boardId: string) => void;
  onOpenSettings: () => void;
  onExit?: () => void;
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
      streaming?: boolean;
      toolCalls?: AssistantToolCall[];
      reasoningSummary?: string;
      activitySteps?: string[];
    }
  | { id: string; role: "result"; prompt: string; result: CreationAssistantResult; artifactIds?: string[] }
  | {
      id: string;
      role: "error";
      content: string;
      retryInstruction?: string;
      retryMessageId?: string;
    };

type QuestionInteraction = Extract<SceneAssistantInteraction, { type: "form" }>;

function toCreationMessage(message: CreateChatMessage): CreationSessionMessage {
  if (message.role === "assistant") return { id: message.id, role: "assistant", content: message.content,
    prompt: message.prompt, confirmed: message.confirmed, mediaType: message.result.mediaType,
    comicDrama: message.comicDrama, toolCalls: message.toolCalls,
    reasoningSummary: message.reasoningSummary, activitySteps: message.activitySteps,
    formInteraction: message.result.interaction?.type === "form" ? message.result.interaction : undefined };
  if (message.role === "result") return { id: message.id, role: "result", content: "", prompt: message.prompt,
    artifactIds: message.artifactIds };
  return { id: message.id, role: message.role, content: message.content };
}

function updateSessionList(current: CreationSession[], saved: CreationSession): CreationSession[] {
  return current.some((session) => session.id === saved.id)
    ? current.map((session) => session.id === saved.id ? saved : session)
    : [saved, ...current];
}

export function isComicDramaIdea(value: string): boolean {
  return /漫剧|漫画短剧|动态漫|分镜|片段脚本|角色卡|连续剧情/u.test(value);
}

const FALLBACK_STARTER_PROMPTS = [
  "一组克制高级的香水产品摄影，深色背景与硬光",
  "为一款独立咖啡品牌设计三张社交媒体视觉",
  "创建一组未来感建筑概念图，清晨薄雾与自然材质",
] as const;

export function CreationAssistantPage({
  boards,
  activeBoardId,
  canUseAgent = true,
  imageProviders = [],
  scenes = [],
  activeImageProviderId,
  activeImageModel,
  activeVideoModelLabel,
  onSelectImageModel,
  onInterpret,
  onCreate,
  onOpenBoard,
  onOpenCreationConversation,
  onOpenSettings,
  onExit,
}: CreationAssistantPageProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = Boolean(useReducedMotion());
  const [value, setValue] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [targetBoardId, setTargetBoardId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CreateChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [sessionTitle, setSessionTitle] = useState("新对话");
  const [projectId, setProjectId] = useState<string | undefined>();
  const [sessionPinned, setSessionPinned] = useState(false);
  const [sessionArchived, setSessionArchived] = useState(false);
  const [sessionCreatedAt, setSessionCreatedAt] = useState(() => new Date().toISOString());
  const [sessions, setSessions] = useState<CreationSession[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const latestSnapshotRef = useRef<CreationSession | null>(null);
  const [sessionEvents, setSessionEvents] = useState<CreationEvent[]>([]);
  const [artifacts, setArtifacts] = useState<CreationArtifact[]>([]);
  const [references, setReferences] = useState<CreationReference[]>([]);
  const [previewReference, setPreviewReference] = useState<{ id: string; name: string; url?: string } | null>(null);
  const [assetChoices, setAssetChoices] = useState<AssetLibraryItem[]>([]);
  const [queued, setQueued] = useState<string[]>([]);
  const [canSteer, setCanSteer] = useState(false);
  const [mediaToolStarted, setMediaToolStarted] = useState(false);
  const steerRef = useRef<((instruction: string) => Promise<boolean>) | null>(null);
  const [queuePaused, setQueuePaused] = useState(false);
  const [editingQueueIndex, setEditingQueueIndex] = useState<number | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | undefined>();
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<CreationProject[]>(readCreationProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queuedRunRef = useRef(false);
  const queuedTimerRef = useRef<number | null>(null);
  const draftRef = useRef(value);
  draftRef.current = value;
  const [clarificationRounds, setClarificationRounds] = useState(0);
  const [interpreting, setInterpreting] = useState(false);
  const [activity, setActivity] = useState("");
  const [agentInteraction, setAgentInteraction] = useState<{
    id: string;
    messageId: string;
    interaction: SceneAssistantInteraction;
    respond: (
      action: "submit" | "dismiss",
      values?: Record<string, string | string[]>,
    ) => void;
  } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      requestVersionRef.current += 1;
      streamAbortRef.current?.abort();
      if (queuedTimerRef.current !== null) window.clearTimeout(queuedTimerRef.current);
      const snapshot = latestSnapshotRef.current;
      if (snapshot && hasImageWorkbenchApi()) {
        const api = getImageWorkbenchApi();
        if (typeof api.saveCreationSession === "function") void api.saveCreationSession(snapshot).catch(() => undefined);
      }
    },
    [],
  );
  const [generatingMessageId, setGeneratingMessageId] = useState<string | null>(
    null,
  );
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(
    null,
  );
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);
  const [starterPrompts, setStarterPrompts] = useState<string[]>([
    ...FALLBACK_STARTER_PROMPTS,
  ]);
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
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [activeSessionIndicator, setActiveSessionIndicator] = useState<{ top: number; height: number } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === targetBoardId) ?? null,
    [boards, targetBoardId],
  );
  const busy = interpreting || Boolean(generatingMessageId);
  const hasImageReferences = references.some((reference) => reference.kind !== "template");
  const matchingSessions = sessions.filter((session) => !session.archived
    && session.title.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  const pinnedSessions = matchingSessions.filter((session) => session.pinned);
  const ungroupedSessions = matchingSessions.filter((session) => !session.projectId && !session.pinned);
  function saveProjects(next: CreationProject[]): void {
    writeCreationProjects(next);
    setProjects(next);
  }
  function createProject(): void {
    const project: CreationProject = { id: crypto.randomUUID(), name: "新项目", createdAt: new Date().toISOString() };
    saveProjects([...projects, project]);
    setExpandedProjects((current) => [...current, project.id]);
    setEditingProjectId(project.id);
    setProjectNameInput(project.name);
  }
  function renameProject(id: string): void {
    const name = projectNameInput.trim();
    if (name) saveProjects(projects.map((project) => project.id === id ? { ...project, name: name.slice(0, 80) } : project));
    setEditingProjectId(null);
  }
  async function updateSession(session: CreationSession, patch: Partial<CreationSession>): Promise<void> {
    if (session.id === conversationId) await flushCreationSnapshot();
    const api = getImageWorkbenchApi();
    const latest = (await api.listCreationSessions()).find((item) => item.id === session.id) ?? session;
    const saved = await api.saveCreationSession({ ...latest, ...patch });
    setSessions((current) => updateSessionList(current, saved));
    window.dispatchEvent(new CustomEvent("iterlay:creation:metadata", { detail: saved }));
  }
  async function removeProject(id: string): Promise<void> {
    for (const session of sessions.filter((item) => item.projectId === id)) await updateSession(session, { projectId: undefined });
    if (projectId === id) setProjectId(undefined);
    saveProjects(projects.filter((project) => project.id !== id));
  }
  function sessionRow(session: CreationSession): React.ReactElement {
    return <div key={session.id} data-session-id={session.id} className={`creation-assistant-chat-row${session.id === conversationId ? " is-active" : ""}`}>
      {editingSessionId === session.id ? <input autoFocus aria-label={uiText("重命名创作会话")} value={sessionNameInput}
        onChange={(event) => setSessionNameInput(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { void updateSession(session, { title: sessionNameInput.trim() || session.title }); setEditingSessionId(null); }
          if (event.key === "Escape") setEditingSessionId(null); }}
        onBlur={() => { if (sessionNameInput.trim()) void updateSession(session, { title: sessionNameInput.trim() }); setEditingSessionId(null); }} />
        : <button type="button" className="creation-assistant-sidebar-item" aria-current={session.id === conversationId ? "page" : undefined}
          onClick={() => void restoreSavedSession(session)}><span title={session.title}>{session.title}</span></button>}
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button type="button" className="creation-assistant-row-action" aria-label={uiText("会话操作：{{ui:0}}", [session.title])}><MoreHorizontal size={15} /></button></DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={() => { setEditingSessionId(session.id); setSessionNameInput(session.title); }}>{uiText("重命名")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void updateSession(session, { pinned: !session.pinned })}>{uiText(session.pinned ? "取消置顶" : "置顶")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void updateSession(session, { archived: !session.archived })}>{uiText(session.archived ? "取消归档" : "归档")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void updateSession(session, { projectId: undefined })}>{uiText("移出项目")}</DropdownMenuItem>
          {projects.map((project) => <DropdownMenuItem key={project.id} onSelect={() => void updateSession(session, { projectId: project.id })}>{project.name}</DropdownMenuItem>)}
        </DropdownMenuContent></DropdownMenu>
    </div>;
  }
  function flushCreationSnapshot(): Promise<unknown> {
    const snapshot = latestSnapshotRef.current;
    if (!snapshot || !hasImageWorkbenchApi()) return Promise.resolve();
    const api = getImageWorkbenchApi();
    return typeof api.saveCreationSession === "function" ? api.saveCreationSession(snapshot).catch(() => undefined) : Promise.resolve();
  }
  latestSnapshotRef.current = sessionReady && (messages.length || references.length || queued.length || sessionEvents.length)
    ? { id: conversationId, title: sessionTitle, projectId, pinned: sessionPinned, archived: sessionArchived, createdAt: sessionCreatedAt,
      updatedAt: new Date().toISOString(), boardId: targetBoardId ?? undefined,
      draft: value, queued, references, messages: messages.map(toCreationMessage), events: sessionEvents,
      artifacts, activeRunId }
    : null;

  async function referencePayloads(): Promise<Array<{ id: string; name: string; mimeType: string; dataBase64: string; role: CreationReference["role"]; sourceNodeId?: string }>> {
    if (!references.length) return [];
    const api = getImageWorkbenchApi();
    return Promise.all(references.filter((reference) => reference.kind !== "template").slice(0, 4).map(async (reference) => {
      const dataUrl = reference.dataBase64
        ? `data:${reference.mimeType};base64,${reference.dataBase64}`
        : reference.imagePath ? await api.readAssetDataUrl(reference.imagePath) : "";
      const match = /^data:([^;,]+);base64,(.+)$/su.exec(dataUrl);
      if (!match) throw new Error(`${reference.name} 已不可用，请移除后重试。`);
      return { id: reference.id, name: reference.name, mimeType: match[1], dataBase64: match[2], role: reference.role,
        sourceNodeId: reference.nodeId };
    }));
  }

  async function addReferenceFiles(files: FileList | File[]): Promise<void> {
    const api = getImageWorkbenchApi();
    for (const file of Array.from(files).slice(0, Math.max(0, 4 - references.length))) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("参考图读取失败。"));
        reader.readAsDataURL(file);
      });
      const id = crypto.randomUUID();
      const saved = await api.saveCreationReference({ id, name: file.name, mimeType: file.type,
        dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
      setReferences((current) => [...current, { id, kind: "upload", role: "reference", name: file.name,
        mimeType: file.type, imagePath: saved.path, previewUrl: saved.url } as CreationReference].slice(0, 4));
    }
  }

  async function openReferencePreview(reference: CreationReference): Promise<void> {
    setPreviewReference({ id: reference.id, name: reference.name, url: reference.previewUrl });
    if (!reference.imagePath) return;
    try {
      const url = await getImageWorkbenchApi().readAssetDataUrl(reference.imagePath);
      setPreviewReference((current) => current?.id === reference.id ? { ...current, url } : current);
    } catch {
      // The thumbnail remains available when the original asset cannot be loaded.
    }
  }

  async function addBoardReference(): Promise<void> {
    const api = getImageWorkbenchApi();
    const board = targetBoardId ? await api.getBoard(targetBoardId) : null;
    const image = board?.nodes.find((node) => "imagePath" in node);
    if (!board || !image || !("imagePath" in image)) return;
    setReferences((current) => current.some((item) => item.imagePath === image.imagePath) ? current : [...current,
      { id: crypto.randomUUID(), kind: "board-image", role: "reference", name: image.title || board.name,
        mimeType: "image/png", boardId: board.id, nodeId: image.id, imagePath: image.imagePath,
        previewUrl: board.images[image.imagePath] } as CreationReference].slice(0, 4));
  }

  async function loadAssetChoices(): Promise<void> {
    const result = await getImageWorkbenchApi().listAssets(undefined, 24);
    setAssetChoices(result.items.filter((item) => item.mediaType !== "video"));
  }

  function addAssetReference(item: AssetLibraryItem): void {
    setReferences((current) => current.some((reference) => reference.imagePath === item.imagePath) ? current : [...current,
      { id: crypto.randomUUID(), kind: "board-image", role: "reference", name: item.boardName,
        mimeType: "image/png", boardId: item.boardId, nodeId: item.nodeId, imagePath: item.imagePath,
        previewUrl: item.thumbnailUrl } as CreationReference].slice(0, 4));
  }

  function addTemplateReference(scene: SceneDefinition): void {
    setReferences((current) => current.some((reference) => reference.sceneId === scene.id) ? current : [...current,
      { id: crypto.randomUUID(), kind: "template", role: "reference", name: scene.name,
        mimeType: "text/plain", sceneId: scene.id } as CreationReference].slice(0, 4));
  }

  useEffect(() => {
    if (busy || agentInteraction || queuePaused || !queued.length || queuedRunRef.current) return;
    queuedRunRef.current = true;
    const next = queued[0];
    setQueued((current) => current.slice(1));
    queuedTimerRef.current = window.setTimeout(() => {
      queuedTimerRef.current = null;
      void interpret(next).finally(() => { queuedRunRef.current = false; });
    }, 0);
  // interpret is intentionally reached only after the current run and interaction settle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, agentInteraction, queuePaused, queued]);

  useEffect(() => {
    let alive = true;
    if (!hasImageWorkbenchApi()) { setSessionReady(true); return; }
    const api = getImageWorkbenchApi();
    if (typeof api.listCreationSessions !== "function") { setSessionReady(true); return; }
    void api.listCreationSessions().then(async (items) => {
      if (!alive) return;
      setSessions(items);
      const selectedId = window.localStorage.getItem("iterlay:creation:active");
      const selected = items.find((item) => item.id === selectedId);
      if (selected) await restoreSavedSession(selected);
    }).catch(() => undefined).finally(() => { if (alive) setSessionReady(true); });
    return () => { alive = false; };
  // Initial load only. Later switches use restoreSavedSession directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const open = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail;
      const selected = sessions.find((item) => item.id === id);
      if (selected) void restoreSavedSession(selected);
    };
    window.addEventListener("iterlay:creation:open", open);
    const start = (): void => resetConversation();
    const metadata = (event: Event): void => {
      const session = (event as CustomEvent<CreationSession>).detail;
      if (session?.id !== conversationId) return;
      if (latestSnapshotRef.current?.id === session.id) latestSnapshotRef.current = {
        ...latestSnapshotRef.current, title: session.title, projectId: session.projectId, pinned: session.pinned, archived: session.archived
      };
      setSessionTitle(session.title); setProjectId(session.projectId); setSessionPinned(Boolean(session.pinned)); setSessionArchived(Boolean(session.archived));
    };
    window.addEventListener("iterlay:creation:new", start);
    window.addEventListener("iterlay:creation:metadata", metadata);
    const updated = (event: Event): void => {
      const session = (event as CustomEvent<CreationSession>).detail;
      if (!session) return;
      setSessions((current) => updateSessionList(current, session));
      const added = session.id === conversationId ? session.artifacts.filter((artifact) => artifact.pluginId && !artifacts.some((item) => item.id === artifact.id)) : [];
      if (added.length) {
        setArtifacts((current) => [...current, ...added]);
        setShowArtifacts(true);
      }
    };
    window.addEventListener("iterlay:creation:updated", updated);
    return () => { window.removeEventListener("iterlay:creation:open", open); window.removeEventListener("iterlay:creation:new", start);
      window.removeEventListener("iterlay:creation:metadata", metadata); window.removeEventListener("iterlay:creation:updated", updated); };
  // These handlers resolve the selected Session at the time of the event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, conversationId, artifacts]);

  useEffect(() => {
    if (!sessionReady || !messages.length && !references.length && !queued.length && !sessionEvents.length) return;
    const timer = window.setTimeout(() => {
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;
      const api = getImageWorkbenchApi();
      if (typeof api.saveCreationSession !== "function") return;
      void api.saveCreationSession(snapshot).then((saved) => {
        setSessions((current) => updateSessionList(current, saved));
        window.dispatchEvent(new CustomEvent("iterlay:creation:updated", { detail: saved }));
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [sessionReady, conversationId, sessionTitle, projectId, sessionPinned, sessionArchived, sessionCreatedAt, messages, references, queued, sessionEvents, artifacts, activeRunId, targetBoardId, value]);
  const composerMediaType = resolveCreateChatMediaType(
    messages
      .filter((message) => message.role === "user")
      .map((message) => ({ role: "user" as const, content: message.content })),
    value,
  );

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const scroll = scrollRef.current;
      if (scroll && followScrollRef.current)
        scroll.scrollTop = scroll.scrollHeight;
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
    const container = sidebarScrollRef.current;
    if (!container || !conversationId) return;
    const selected = [...container.querySelectorAll<HTMLElement>("[data-session-id]")]
      .find((element) => element.dataset.sessionId === conversationId);
    if (!selected) return;
    selected.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [conversationId, reduceMotion, sessions, projects]);

  useLayoutEffect(() => {
    const container = sidebarScrollRef.current;
    if (!container || !conversationId) return;
    const updateIndicator = (): void => {
      const selected = [...container.querySelectorAll<HTMLElement>("[data-session-id]")]
        .find((element) => element.dataset.sessionId === conversationId);
      if (!selected) {
        setActiveSessionIndicator(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      setActiveSessionIndicator({ top: selectedRect.top - containerRect.top + container.scrollTop, height: selectedRect.height });
    };
    updateIndicator();
    container.addEventListener("scroll", updateIndicator, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateIndicator);
    observer?.observe(container);
    return () => { container.removeEventListener("scroll", updateIndicator); observer?.disconnect(); };
  }, [conversationId, sessions, projects, searchQuery, expandedProjects]);

  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = window.setTimeout(() => setCopiedMessageId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedMessageId]);

  const loadStarterPrompts = useCallback(
    async (
      suggestionMode: "contextual" | "divergent",
      previousSuggestions: string[] = [],
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
          variationSeed: crypto.randomUUID(),
        });
        if (starterPromptsRequestRef.current !== requestId) return;
        const suggestions = [
          ...new Set(
            result.suggestions
              .map((suggestion) => suggestion.trim())
              .filter(Boolean),
          ),
        ].slice(0, 3);
        if (suggestions.length === 3) setStarterPrompts(suggestions);
      } catch {
        // Keep the local starters when the dedicated suggestion agent is unavailable.
      } finally {
        if (starterPromptsRequestRef.current === requestId)
          setStarterPromptsLoading(false);
      }
    },
    [canUseAgent],
  );

  useEffect(() => {
    if (targetBoardId && !selectedBoard) setTargetBoardId(null);
  }, [selectedBoard, targetBoardId]);

  useEffect(() => {
    void loadStarterPrompts("contextual");
  }, [conversationId, loadStarterPrompts]);

  useEffect(() => {
    const element = scrollRef.current;
    if (
      !element ||
      restoreWithoutScrollAnimationRef.current ||
      !followScrollRef.current
    )
      return;
    if (skipNextSmoothScrollRef.current) {
      skipNextSmoothScrollRef.current = false;
      return;
    }
    if (typeof element.scrollTo === "function") {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
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

  function resetConversation(nextProjectId?: string): void {
    void flushCreationSnapshot();
    if (queuedTimerRef.current !== null) window.clearTimeout(queuedTimerRef.current);
    queuedTimerRef.current = null;
    queuedRunRef.current = false;
    streamAbortRef.current?.abort();
    requestVersionRef.current += 1;
    followScrollRef.current = true;
    setShowScrollButton(false);
    setMessages([]);
    setMobileSidebarOpen(false);
    setSessionEvents([]);
    setArtifacts([]);
    setReferences([]);
    setQueued([]);
    setCanSteer(false);
    setMediaToolStarted(false);
    steerRef.current = null;
    setQueuePaused(false);
    setActiveRunId(undefined);
    setShowArtifacts(false);
    setValue("");
    setEditingMessageId(null);
    setTargetBoardId(null);
    setConversationId(crypto.randomUUID());
    setSessionTitle("新对话");
    setProjectId(nextProjectId);
    setSessionPinned(false);
    setSessionArchived(false);
    setSessionCreatedAt(new Date().toISOString());
    window.localStorage.removeItem("iterlay:creation:active");
    setClarificationRounds(0);
    setInterpreting(false);
    setGeneratingMessageId(null);
    setGenerationStartedAt(null);
    setActiveDecisionId(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function restoreSavedSession(session: CreationSession): Promise<void> {
    await flushCreationSnapshot();
    if (queuedTimerRef.current !== null) window.clearTimeout(queuedTimerRef.current);
    queuedTimerRef.current = null;
    queuedRunRef.current = false;
    streamAbortRef.current?.abort();
    requestVersionRef.current += 1;
    const api = getImageWorkbenchApi();
    const boardIds = [...new Set(session.artifacts.map((artifact) => artifact.boardId))];
    const boardEntries = await Promise.all(boardIds.map(async (id) => [id, await api.getBoard(id)] as const));
    const details = new Map(boardEntries);
    const resolvedArtifacts = await Promise.all(session.artifacts.map(async (artifact) => {
      const board = details.get(artifact.boardId);
      if ((artifact.kind === "comic-drama" || artifact.mediaType === "project") && board) return artifact;
      if (board && artifact.path && artifactUrl(board, artifact)) return artifact;
      if ((artifact.kind === "video" || artifact.mediaType === "video") && artifact.jobId) {
        const job = await api.getVideoJob(artifact.jobId).catch(() => null);
        if (job?.status === "completed" && job.outputVideoPath) return { ...artifact, path: job.outputVideoPath, status: "ready" as const };
        if (job && !["failed", "cancelled"].includes(job.status)) return { ...artifact, status: "pending" as const };
      }
      return { ...artifact, status: "failed" as const };
    }));
    const completedPrompts = new Set(session.messages.filter((message) => message.role === "result" && message.artifactIds?.length)
      .map((message) => message.prompt).filter(Boolean));
    for (const artifact of resolvedArtifacts) if (artifact.status === "ready") completedPrompts.add(artifact.prompt);
    const resolvedReferences = await Promise.all(session.references.map(async (reference) => {
      if (!reference.imagePath) return reference;
      if (reference.kind === "board-image") {
        const board = reference.boardId ? await api.getBoard(reference.boardId) : null;
        return { ...reference, previewUrl: board?.images[reference.imagePath] };
      }
      return { ...reference, previewUrl: await api.creationReferenceUrl(reference.imagePath).catch(() => undefined) };
    }));
    setConversationId(session.id);
    setMobileSidebarOpen(false);
    setSessionTitle(session.title);
    setProjectId(session.projectId);
    setSessionPinned(Boolean(session.pinned));
    setSessionArchived(Boolean(session.archived));
    setSessionCreatedAt(session.createdAt);
    setTargetBoardId(session.boardId ?? null);
    setArtifacts(resolvedArtifacts);
    setReferences(resolvedReferences);
    setQueued(session.queued ?? []);
    setCanSteer(false);
    setMediaToolStarted(false);
    steerRef.current = null;
    setQueuePaused(Boolean(session.queued?.length));
    setSessionEvents(session.events.map((event) => {
      if (event.kind !== "run" || event.status !== "running") return event;
      const delivered = session.events.some((item) => item.kind === "artifact" && item.runId === event.runId
        && resolvedArtifacts.some((artifact) => artifact.id === item.artifactId && artifact.status === "ready"));
      return { ...event, status: delivered ? "completed" : "cancelled",
        label: delivered ? "作品已保存" : "上次运行已中断" };
    }));
    setActiveRunId(undefined);
    setMessages(session.messages.map((message): CreateChatMessage => {
      if (message.role === "user" || message.role === "error") return { id: message.id, role: message.role, content: message.content };
      if (message.role === "result") {
        const attached = resolvedArtifacts.filter((artifact) => message.artifactIds?.includes(artifact.id));
        const boardId = attached[0]?.boardId ?? session.boardId ?? "";
        const board = details.get(boardId);
        return { id: message.id, role: "result", prompt: message.prompt ?? "", artifactIds: message.artifactIds,
          result: { boardId, boardName: attached[0]?.boardName ?? "", images: attached.filter((item) => item.kind === "image" && board && item.status === "ready")
            .map((item) => ({ id: item.id, dataUrl: artifactUrl(board!, item)! })),
          videos: attached.filter((item) => item.kind === "video" && board && item.status === "ready")
            .map((item) => ({ id: item.id, url: artifactUrl(board!, item)! })) } };
      }
      const prompt = message.prompt ?? "";
      return { id: message.id, role: "assistant", content: message.content, prompt,
        confirmed: message.confirmed || completedPrompts.has(prompt), comicDrama: message.comicDrama, toolCalls: message.toolCalls,
        reasoningSummary: message.reasoningSummary, activitySteps: message.activitySteps,
        result: { message: message.content, intent: prompt ? "direct" : "chat", mediaType: message.mediaType,
          interaction: message.formInteraction,
          fields: prompt ? [{ label: "提示词", value: prompt }] : [] } };
    }));
    setValue(session.draft ?? "");
    setInterpreting(false);
    setGeneratingMessageId(null);
    const lastAssistant = [...session.messages].reverse().find((message) => message.role === "assistant");
    const lastAssistantIndex = lastAssistant ? session.messages.findLastIndex((message) => message.id === lastAssistant.id) : -1;
    const lastUserIndex = session.messages.findLastIndex((message) => message.role === "user");
    setActiveDecisionId(lastAssistant?.role === "assistant" &&
      lastAssistantIndex > lastUserIndex &&
      (lastAssistant.formInteraction || lastAssistant.prompt && !lastAssistant.confirmed && !completedPrompts.has(lastAssistant.prompt))
      ? lastAssistant.id : null);
    setShowArtifacts(resolvedArtifacts.length > 0);
    window.localStorage.setItem("iterlay:creation:active", session.id);
  }

  function conversationBeforeCurrentTurn(
    history: CreateChatMessage[],
  ): AssistantConversationMessage[] {
    return history
      .flatMap((message): AssistantConversationMessage[] => {
        if (message.role === "user")
          return [{ role: "user", content: message.content }];
        if (message.role === "assistant")
          return [
            {
              role: "assistant",
              content: [
                message.content,
                message.prompt,
                message.prompt && message.result.mediaType === "video"
                  ? "交付类型：video"
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ];
        return [];
      })
      .filter((message) => message.content.trim().length > 0)
      .slice(-16);
  }

  async function interpret(
    instructionValue: string,
    displayContent = instructionValue,
  ): Promise<void> {
    const instruction = instructionValue.trim() || (hasImageReferences ? "请根据参考图进行创作" : "");
    if (!instruction || busy) return;
    if (!canUseAgent) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "error",
          content: "Pi Agent 尚未配置，请先设置文本模型。",
        },
      ]);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    followScrollRef.current = true;
    const editIndex = messages.findIndex(
      (message) => message.id === editingMessageId && message.role === "user",
    );
    if (editIndex === 0 || !messages.some((message) => message.role === "user"))
      setSessionTitle(instruction.split(/\r?\n/u, 1)[0].slice(0, 48));
    const priorMessages =
      editIndex < 0 ? messages : messages.slice(0, editIndex);
    const priorConversation = conversationBeforeCurrentTurn(priorMessages);
    const assistantId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const runEventId = crypto.randomUUID();
    setActiveRunId(runId);
    setSessionEvents((current) => [...current, { id: runEventId, kind: "run", runId, status: "running", label: "正在梳理需求", at: new Date().toISOString() }]);
    window.localStorage.setItem("iterlay:creation:active", conversationId);
    const abort = new AbortController();
    streamAbortRef.current?.abort();
    streamAbortRef.current = abort;
    let mediaAttemptedByAgent = false;
    setCanSteer(false);
    setMediaToolStarted(false);
    steerRef.current = null;
    let toolCalls: AssistantToolCall[] = [];
    setAgentInteraction(null);
    setActivity("正在梳理需求…");
    setMessages([
      ...priorMessages,
      { id: crypto.randomUUID(), role: "user", content: displayContent },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        result: { message: "", fields: [] },
        prompt: "",
        streaming: true,
      },
    ]);
    setValue("");
    setEditingMessageId(null);
    setActiveDecisionId(null);
    setInterpreting(true);

    try {
      const preparedReferences = await referencePayloads();
      const result = await onInterpret(
        {
          instruction,
          referenceImages: preparedReferences.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 })),
          currentFields: [
            {
              label: "目标画板",
              value: selectedBoard
                ? `${selectedBoard.name} (${selectedBoard.id})`
                : "新建画板",
            },
            ...(activeImageProviderId ? [{ label: "图片 Provider ID", value: activeImageProviderId }] : []),
            ...(activeImageModel ? [{ label: "图片模型", value: activeImageModel }] : []),
            ...preparedReferences.map((reference) => ({
              label: reference.role === "edit-target" ? "编辑主体" : "参考素材",
              value: `${reference.name}\n托管路径：${references.find((item) => item.id === reference.id)?.imagePath ?? "不可用，请勿生成"}`,
            })),
            ...references.filter((reference) => reference.kind === "template").flatMap((reference) => {
              const scene = scenes.find((item) => item.id === reference.sceneId);
              return scene ? [{ label: "创作模板", value: `${scene.name}\n${scene.prompt}` }] : [];
            }),
          ],
          generationSettings: {
            count: 1,
            maxCount: getProviderMaxImageCount(
              imageProviders.find(
                (provider) => provider.id === activeImageProviderId,
              ) ?? imageProviders[0],
            ),
          },
          clarificationRounds: editIndex < 0 ? clarificationRounds : 0,
          conversation: priorConversation,
          conversationId,
          assistantSurface: "canvas-prompt",
          memoryQuery: targetBoardId ? { boardId: targetBoardId } : undefined,
          workflowMode: "generate",
          creationWorkflow: true,
          agentMode: true,
          ...(resolveCreateChatMediaType(priorConversation, instruction) ===
          "video"
            ? { assistantScenario: "video" as const }
            : {}),
        },
        {
          signal: abort.signal,
          onDelta: (delta) => {
            if (requestVersionRef.current !== requestVersion) return;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId && message.role === "assistant"
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          onReasoningSummary: (delta) => {
            if (requestVersionRef.current !== requestVersion) return;
            setMessages((current) => current.map((message) => message.id === assistantId && message.role === "assistant"
              ? { ...message, reasoningSummary: (message.reasoningSummary ?? "") + delta } : message));
          },
          onActivity: (label) => {
            if (requestVersionRef.current === requestVersion) {
              setActivity(label);
              setMessages((current) => current.map((message) => message.id === assistantId && message.role === "assistant"
                ? { ...message, activitySteps: message.activitySteps?.at(-1) === label ? message.activitySteps : [...(message.activitySteps ?? []), label].slice(-100) } : message));
              setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run" ? { ...event, label } : event));
            }
          },
          onTool: (tool) => {
            if (requestVersionRef.current !== requestVersion) return;
            toolCalls = mergeCreationTool(toolCalls, tool);
            const task = agentMediaTaskFromTool(tool);
            if (task) void (async () => {
              const api = getImageWorkbenchApi();
              const job = task.kind === "video" ? await api.getVideoJob(task.id) : (await api.listHistory(task.boardId)).find((item) => item.id === task.id || item.input.clientTaskId === task.id);
              if (requestVersionRef.current !== requestVersion) return;
              const boardId = job && "input" in job && "boardId" in job.input ? job.input.boardId
                : job && "boardId" in job ? job.boardId : task.boardId;
              if (!boardId) return;
              const board = await api.getBoard(boardId);
              if (requestVersionRef.current !== requestVersion) return;
              const path = job && "outputVideoPath" in job ? job.outputVideoPath
                : job && "outputImagePaths" in job ? job.outputImagePaths[0] : undefined;
              const artifact: CreationArtifact = { id: task.id, kind: task.kind, mediaType: task.kind,
                boardId, boardName: board?.name ?? "创作画板", jobId: job?.id ?? task.id, path,
                prompt: task.prompt, status: path ? "ready" : "pending", createdAt: new Date().toISOString() };
              setTargetBoardId(boardId);
              setArtifacts((current) => [...current.filter((item) => item.id !== artifact.id), artifact]);
              setSessionEvents((current) => [...current, { id: crypto.randomUUID(), kind: "artifact", runId,
                artifactId: artifact.id, at: new Date().toISOString() }]);
              setShowArtifacts(true);
            })().catch(() => undefined);
            setMessages((current) => current.map((message) => message.id === assistantId && message.role === "assistant"
              ? { ...message, toolCalls: mergeCreationTool(message.toolCalls, tool) } : message));
            setSessionEvents((current) => {
              const match = current.find((event) => event.kind === "tool" && event.call.id === tool.id);
              return match ? current.map((event) => event === match && event.kind === "tool"
                ? { ...event, call: { ...event.call, ...tool } } : event)
                : [...current, { id: crypto.randomUUID(), kind: "tool" as const, runId, call: tool, at: new Date().toISOString() }];
            });
            if (
              ["generate_image", "generate_video", "edit_image"].includes(
                tool.name,
              )
            ) {
              mediaAttemptedByAgent = true;
              setMediaToolStarted(true);
            }
          },
          onSteerAvailable: (steer) => { if (requestVersionRef.current === requestVersion) { steerRef.current = steer; setCanSteer(true); } },
          onInteraction: (interaction, respond) => {
            if (requestVersionRef.current !== requestVersion) return;
            const interactionEventId = crypto.randomUUID();
            setSessionEvents((current) => [...current, { id: interactionEventId, kind: "interaction", runId,
              status: "requested", label: interaction.title, at: new Date().toISOString() }]);
            setAgentInteraction({
              id: crypto.randomUUID(),
              messageId: assistantId,
              interaction,
              respond: (action, values) => {
                setSessionEvents((current) => current.map((event) => event.id === interactionEventId && event.kind === "interaction"
                  ? { ...event, status: "resolved" } : event));
                respond(action, values);
              },
            });
            setActivity(
              interaction.type === "permission"
                ? "等待你的授权"
                : interaction.type === "form"
                  ? "等待你的回答"
                  : "等待你的确认",
            );
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId && message.role === "assistant"
                  ? { ...message, result: { ...message.result, interaction } }
                  : message,
              ),
            );
            setActiveDecisionId(assistantId);
          },
        },
      );
      if (requestVersionRef.current !== requestVersion) return;

      setAgentInteraction(null);
      setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run"
        ? { ...event, status: "completed", label: "已完成" } : event));
      setActiveRunId(undefined);
      const prompt =
        mediaAttemptedByAgent ||
        result.intent === "chat" ||
        result.interaction?.type === "form"
          ? ""
          : sceneAssistantFieldsToPrompt(result.fields) ||
            result.detailedPrompt?.trim() ||
            "";
      const assistantMessage: Extract<
        CreateChatMessage,
        { role: "assistant" }
      > = {
        id: assistantId,
        role: "assistant",
        content: result.message,
        confirmed: mediaAttemptedByAgent,
        result: {
          ...result,
          mediaType: resolveCreateChatMediaType(
            priorConversation,
            instruction,
            result.mediaType,
          ),
        },
        prompt,
        comicDrama:
          isComicDramaIdea(instruction) &&
          !/视频|动画|video|animation/iu.test(instruction),
        toolCalls,
      };
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && message.role === "assistant"
            ? { ...assistantMessage, reasoningSummary: message.reasoningSummary, activitySteps: message.activitySteps } : message,
        ),
      );
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
      setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run"
        ? { ...event, status: abort.signal.aborted ? "cancelled" : "failed",
          label: abort.signal.aborted ? "已停止" : "执行失败" } : event));
      setActiveRunId(undefined);
      setMessages((current) => [
        ...current
          .filter(
            (message) =>
              message.id !== assistantId ||
              (message.role === "assistant" && (message.content || message.reasoningSummary || message.activitySteps?.length || message.toolCalls?.length)),
          )
          .map((message) =>
            message.id === assistantId && message.role === "assistant"
              ? { ...message, streaming: false, toolCalls: settleAssistantToolCalls(message.toolCalls, abort.signal.aborted ? "cancelled" : "error") }
              : message,
          ),
        {
          id: crypto.randomUUID(),
          role: "error",
          content:
            error instanceof Error
              ? error.message
              : "Pi Agent 暂时不可用，请稍后重试。",
          retryInstruction: instruction,
        },
      ]);
    } finally {
      if (requestVersionRef.current === requestVersion) {
        streamAbortRef.current = null;
        steerRef.current = null;
        setCanSteer(false);
        setAgentInteraction(null);
        setInterpreting(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }

  async function submit(): Promise<void> {
    const next = value.trim();
    if (!next && !hasImageReferences) return;
    if (editingQueueIndex !== null) {
      setQueued((current) => current.map((item, index) => index === editingQueueIndex ? next : item));
      setEditingQueueIndex(null);
      setValue("");
      return;
    }
    if (interpreting && canSteer && !mediaToolStarted && !agentInteraction && steerRef.current) {
      try {
        if (await steerRef.current(next)) {
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: next }]);
          setValue("");
          setSessionEvents((current) => [...current, { id: crypto.randomUUID(), kind: "interaction",
            runId: activeRunId ?? conversationId, status: "resolved", label: "已补充当前执行", at: new Date().toISOString() }]);
          return;
        }
      } catch {
        // Preserve the input in the queue when the current run cannot accept it.
      }
    }
    if (busy || agentInteraction) {
      setQueued((current) => [...current, next].slice(0, 30));
      setValue("");
      return;
    }
    await interpret(next, next || "请根据参考图进行创作");
  }

  async function confirmGeneration(
    message: Extract<CreateChatMessage, { role: "assistant" }>,
    authorizedByAgent = false,
  ): Promise<void> {
    if (
      !message.prompt ||
      (!authorizedByAgent && (message.id !== activeDecisionId || busy))
    )
      return;
    const requestVersion = ++requestVersionRef.current;
    const runId = crypto.randomUUID();
    const runEventId = crypto.randomUUID();
    setActiveRunId(runId);
    setSessionEvents((current) => [...current, { id: runEventId, kind: "run", runId,
      status: "running", label: message.result.mediaType === "video" ? "正在生成视频" : "正在生成图片",
      at: new Date().toISOString() }]);
    setGeneratingMessageId(message.id);
    setGenerationStartedAt(Date.now());
    setActivity(
      message.result.mediaType === "video"
        ? "正在提交视频任务…"
        : "正在生成图片…",
    );
    try {
      const preparedReferences = await referencePayloads();
      const editTarget = references.find((reference) => reference.role === "edit-target" && reference.imagePath);
      const result = await onCreate({
        prompt: message.prompt,
        targetBoardId,
        conversationId,
        suggestedName: message.result.suggestedName,
        comicDrama: message.comicDrama,
        mediaType: message.result.mediaType,
        count: message.result.generationCount,
        videoSettings: message.result.videoSettings,
        references: preparedReferences,
        referencePaths: references.flatMap((reference) => reference.imagePath && reference.kind !== "template" ? [reference.imagePath] : []),
        editSource: editTarget?.imagePath
          ? { boardId: editTarget.boardId, nodeId: editTarget.nodeId, imagePath: editTarget.imagePath }
          : undefined,
        onArtifact: (artifact) => {
          if (requestVersionRef.current !== requestVersion) return;
          setArtifacts((current) => [...current.filter((item) => item.id !== artifact.id), artifact]);
          setSessionEvents((current) => [...current, { id: crypto.randomUUID(), kind: "artifact", runId,
            artifactId: artifact.id, at: new Date().toISOString() }]);
        },
        onProgress: (label) => {
          if (requestVersionRef.current === requestVersion) {
            setActivity(label);
            setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run" ? { ...event, label } : event));
          }
        },
      });
      if (requestVersionRef.current !== requestVersion) return;
      const api = hasImageWorkbenchApi() ? getImageWorkbenchApi() : null;
      const board = api && typeof api.getBoard === "function" ? await api.getBoard(result.boardId) : null;
      const found = board ? artifactsFromBoard(board, result.images.map((image) => image.id), result.videoJobId, message.prompt) : [];
      if (result.comicDrama) found.push({ id: result.boardId, kind: "comic-drama", mediaType: "project", boardId: result.boardId,
        boardName: result.boardName, prompt: message.prompt, status: "ready", createdAt: new Date().toISOString() });
      for (const video of result.videos ?? []) {
        const index = found.findIndex((artifact) => artifact.id === video.id);
        const finalized: CreationArtifact = { ...(index >= 0 ? found[index] : {
          id: video.id, kind: "video", mediaType: "video", boardId: result.boardId, boardName: result.boardName,
          jobId: result.videoJobId, prompt: message.prompt, createdAt: new Date().toISOString()
        }), path: video.path, nodeId: video.nodeId, status: "ready" };
        if (index >= 0) found[index] = finalized; else found.push(finalized);
      }
      setArtifacts((current) => [...current.filter((item) => !found.some((artifact) => artifact.id === item.id)), ...found]);
      setShowArtifacts(found.length > 0);
      setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run"
        ? { ...event, status: "completed", label: "作品已保存" } : event));
      setActiveRunId(undefined);
      setTargetBoardId(result.boardId);
      setMessages((current) => [
        ...current.map((item) =>
          item.id === message.id ? { ...item, confirmed: true } : item,
        ),
        {
          id: crypto.randomUUID(),
          role: "result",
          prompt: message.prompt,
          result,
          artifactIds: found.map((artifact) => artifact.id),
        },
      ]);
      setActiveDecisionId(null);
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      setSessionEvents((current) => current.map((event) => event.id === runEventId && event.kind === "run"
        ? { ...event, status: "failed", label: "生成失败" } : event));
      setActiveRunId(undefined);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "error",
          content:
            error instanceof Error ? error.message : "生成失败，请稍后重试。",
          retryMessageId: message.id,
        },
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
  const filteredBoards = boards.filter((board) =>
    board.name.toLocaleLowerCase().includes(boardSearchQuery.trim().toLocaleLowerCase()),
  );
  function openCreationBoard(boardId: string): void {
    if (onOpenCreationConversation) onOpenCreationConversation(conversationId, boardId);
    else onOpenBoard(boardId);
  }
  const isEmpty = messages.length === 0 && !interpreting;
  const latestMessage = messages.at(-1);
  const showWaitingStatus = interpreting && latestMessage?.role === "assistant"
    && !latestMessage.content.trim() && !latestMessage.toolCalls?.length && !agentInteraction;

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
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <div className="create-chat-workspace" data-window-platform={/Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? "macos" : "windows"} data-preview-open={showArtifacts && artifacts.length > 0}>
    <aside className={`creation-assistant-sidebar${mobileSidebarOpen ? " is-mobile-open" : ""}`} aria-label={uiText("创作助手导航")}>
      <div className="creation-assistant-sidebar-header">
        <strong>{uiText("创作助手")}</strong>
        {mobileSidebarOpen ? <button type="button" className="create-chat-icon-button creation-assistant-mobile-close" onClick={() => setMobileSidebarOpen(false)} aria-label={uiText("关闭侧边栏")} title={uiText("关闭侧边栏")}><X size={17} strokeWidth={1.7} /></button> : null}
      </div>
      <>
        <button type="button" className="creation-assistant-new-chat" onClick={() => resetConversation()}>
          <Pencil size={16} strokeWidth={1.7} />
          <span>{uiText("新建聊天")}</span>
        </button>
        <label className="creation-assistant-search"><Search size={15} aria-hidden="true" /><input type="search" value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)} aria-label={uiText("搜索创作会话")} placeholder={uiText("搜索创作会话")} /></label>
        <div ref={sidebarScrollRef} className="creation-assistant-sidebar-scroll">
          {activeSessionIndicator ? <span className="creation-assistant-active-indicator" aria-hidden="true" style={{ transform: `translateY(${activeSessionIndicator.top}px)`, height: activeSessionIndicator.height }} /> : null}
          {pinnedSessions.length ? <section className="creation-assistant-sidebar-section" aria-label={uiText("置顶")}>
            <div className="creation-assistant-sidebar-label">{uiText("置顶")}</div>
            {pinnedSessions.map(sessionRow)}
          </section> : null}
          <section className="creation-assistant-sidebar-section" aria-labelledby="creation-projects-heading">
            <div className="creation-assistant-sidebar-label" id="creation-projects-heading"><span>{uiText("项目")}</span>
              <button type="button" onClick={createProject} aria-label={uiText("新建项目")} title={uiText("新建项目")}><Plus size={15} /></button></div>
            {projects.map((project) => {
              const projectSessions = matchingSessions.filter((session) => session.projectId === project.id && !session.pinned);
              const expanded = expandedProjects.includes(project.id) || Boolean(searchQuery);
              return <div key={project.id} className="creation-assistant-project">
                <div className="creation-assistant-project-row">
                  {editingProjectId === project.id ? <input autoFocus aria-label={uiText("项目名称")} value={projectNameInput}
                    onChange={(event) => setProjectNameInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") renameProject(project.id); if (event.key === "Escape") setEditingProjectId(null); }}
                    onBlur={() => renameProject(project.id)} />
                    : <button type="button" className="creation-assistant-sidebar-item" aria-expanded={expanded}
                      onClick={() => setExpandedProjects((current) => expanded ? current.filter((id) => id !== project.id) : [...current, project.id])}>
                      <Folder size={16} strokeWidth={1.7} /><span title={project.name}>{project.name}</span><ChevronDown size={14} className={expanded ? "" : "creation-assistant-chevron-closed"} />
                    </button>}
                  <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button type="button" className="creation-assistant-row-action" aria-label={uiText("项目操作：{{ui:0}}", [project.name])}><MoreHorizontal size={15} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem onSelect={() => resetConversation(project.id)}>{uiText("在项目中新建聊天")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => { setEditingProjectId(project.id); setProjectNameInput(project.name); }}>{uiText("重命名")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void removeProject(project.id)}>{uiText("删除项目")}</DropdownMenuItem>
                    </DropdownMenuContent></DropdownMenu>
                </div>
                {expanded ? <div className="creation-assistant-project-chats">
                  <button type="button" className="creation-assistant-project-new" onClick={() => resetConversation(project.id)}><Plus size={14} />{uiText("新建聊天")}</button>
                  {projectSessions.map(sessionRow)}
                </div> : null}
              </div>;
            })}
            {!projects.length ? <span className="creation-assistant-sidebar-empty">{uiText("还没有项目")}</span> : null}
          </section>
          {ungroupedSessions.length ? <section className="creation-assistant-sidebar-section" aria-label={uiText("最近聊天")}>
            <div className="creation-assistant-sidebar-label">{uiText("最近聊天")}</div>
            {ungroupedSessions.map(sessionRow)}
          </section> : null}
          {!matchingSessions.length && projects.length ? <span className="creation-assistant-sidebar-empty">{uiText("还没有聊天")}</span> : null}
        </div>
      </>
      <div className="creation-assistant-sidebar-footer">
        {onExit ? <button type="button" className="creation-assistant-exit" onClick={onExit} aria-label={uiText("退出助手")} title={uiText("退出助手")}>
          <LogOut size={16} strokeWidth={1.7} aria-hidden="true" /><span>{uiText("退出助手")}</span>
        </button> : null}
      </div>
    </aside>
    <section
      className="create-chat"
      data-empty={isEmpty}
      aria-label={uiText("AI 创作")}
    >
      <header
        className="workbench-page-header create-chat-header creation-assistant-chat-header window-titlebar-overlay-safe"
      >
        <button type="button" className="create-chat-icon-button creation-assistant-mobile-toggle" onClick={() => setMobileSidebarOpen(true)} aria-label={uiText("打开侧边栏")} title={uiText("打开侧边栏")}><PanelLeftOpen size={18} strokeWidth={1.7} /></button>
        <h1 title={sessionTitle}>{messages.length ? sessionTitle : uiText("新对话")}</h1>
        <div className="create-chat-header-actions">
          {artifacts.length ? <button
            type="button"
            onClick={() => setShowArtifacts((current) => !current)}
            aria-label={uiText(showArtifacts ? "收起成果预览" : "查看创作成果")}
            title={uiText(showArtifacts ? "收起成果预览" : "查看创作成果")}
            aria-expanded={showArtifacts}
            className="create-chat-icon-button"
          >
            <LayoutGrid size={18} strokeWidth={1.7} />
          </button> : null}
        </div>
      </header>

      <div className="create-chat-body">
        {isEmpty ? (
          <div
            ref={scrollRef}
            data-create-chat-scroll
            className="create-chat-empty-scroll"
          >
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
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                80;
              followScrollRef.current = nearBottom;
              setShowScrollButton(!nearBottom);
            }}
          >
            <div
              ref={threadRef}
              className="create-chat-thread"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message) =>
                message.role === "user" ? (
                  <AssistantMessageFrame
                    key={message.id}
                    role="user"
                    label={uiText("你")}
                  >
                    <p>{message.content}</p>
                    <div className="create-chat-message-actions">
                      <button
                        type="button"
                        className="create-chat-icon-button"
                        onClick={() =>
                          void copyMessage(message.id, message.content)
                        }
                        aria-label={uiText("复制消息")}
                        title={uiText("复制消息")}
                      >
                        {copiedMessageId === message.id ? (
                          <Check size={16} />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="create-chat-icon-button"
                        disabled={busy}
                        aria-label={uiText("编辑消息")}
                        title={uiText("编辑消息")}
                        onClick={() => {
                          setEditingMessageId(message.id);
                          setValue(message.content);
                          textareaRef.current?.focus();
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </AssistantMessageFrame>
                ) : message.role === "error" ? (
                  <div
                    key={message.id}
                    className="create-chat-error"
                    role="alert"
                  >
                    <AlertCircle size={18} />
                    <div>
                      <p>{message.content}</p>
                      <div className="create-chat-error-actions">
                        {message.retryInstruction ||
                        message.retryMessageId === activeDecisionId ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (message.retryInstruction)
                                void interpret(message.retryInstruction);
                              else {
                                const plan = messages.find(
                                  (item) => item.id === message.retryMessageId,
                                );
                                if (plan?.role === "assistant")
                                  void confirmGeneration(plan);
                              }
                            }}
                          >
                            <RefreshCw size={14} />
                            {uiText("重试")}
                          </button>
                        ) : null}
                        {!canUseAgent ? (
                          <button type="button" onClick={onOpenSettings}>
                            {uiText("打开设置")}
                            <ArrowUpRight size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : message.role === "assistant" ? (
                  <AssistantMessageFrame
                    key={message.id}
                    role="assistant"
                    label={uiText("创作助手")}
                  >
                    <AssistantProcessDetails reasoningSummary={message.reasoningSummary} activitySteps={message.activitySteps} streaming={message.streaming} />
                    {message.content.trim() ? <AssistantResponse
                      content={message.content}
                      streaming={message.streaming}
                    /> : null}
                    {message.toolCalls?.length ? <AssistantToolGroup calls={message.toolCalls} /> : null}
                    {agentInteraction?.messageId === message.id &&
                    agentInteraction.interaction.type === "permission" ? (
                      <AssistantPermissionCard
                        key={agentInteraction.id}
                        interaction={agentInteraction.interaction}
                        onDecision={(decision) => {
                          agentInteraction.respond(
                            decision === "deny" ? "dismiss" : "submit",
                            { permissionDecision: decision },
                          );
                          setActivity("正在继续…");
                          setAgentInteraction(null);
                          setActiveDecisionId(null);
                        }}
                      />
                    ) : message.result.interaction?.type === "form" &&
                      message.id === activeDecisionId ? (
                      <CreateQuestionCard
                        key={
                          agentInteraction?.messageId === message.id
                            ? agentInteraction.id
                            : message.id
                        }
                        interaction={message.result.interaction}
                        disabled={
                          busy && agentInteraction?.messageId !== message.id
                        }
                        onDismiss={() => {
                          if (agentInteraction?.messageId === message.id) {
                            agentInteraction.respond("dismiss");
                            setAgentInteraction(null);
                          }
                          setActiveDecisionId(null);
                          textareaRef.current?.focus();
                        }}
                        onSubmit={(values) => {
                          const answers = formatAssistantInteractionAnswers(
                            message.result.interaction as QuestionInteraction,
                            values,
                          );
                          if (agentInteraction?.messageId === message.id) {
                            agentInteraction.respond("submit", values);
                            setAgentInteraction(null);
                            setActiveDecisionId(null);
                          } else void interpret(answers, answers);
                        }}
                      />
                    ) : agentInteraction?.messageId === message.id &&
                      agentInteraction.interaction.type === "confirm" ? (
                      <section className="ct-card">
                        <header className="ct-card-heading">
                          <h3>{agentInteraction.interaction.title}</h3>
                          <p>{agentInteraction.interaction.description}</p>
                        </header>
                        <footer className="ct-card-actions">
                          <button
                            type="button"
                            className="ct-button ct-button-quiet"
                            onClick={() => {
                              agentInteraction.respond("dismiss");
                              setAgentInteraction(null);
                            }}
                          >
                            {agentInteraction.interaction.cancelLabel ||
                              uiText("继续调整")}
                          </button>
                          <button
                            type="button"
                            className="ct-button ct-button-primary"
                            onClick={() => {
                              agentInteraction.respond("submit");
                              setAgentInteraction(null);
                            }}
                          >
                            {agentInteraction.interaction.confirmLabel ||
                              uiText("确认生成")}
                          </button>
                        </footer>
                      </section>
                    ) : message.prompt ? (
                      <CreatePlanCard
                        prompt={message.prompt}
                        targetLabel={targetLabel}
                        active={message.id === activeDecisionId}
                        confirmed={message.confirmed}
                        historical={message.historical}
                        generating={generatingMessageId === message.id}
                        disabled={busy}
                        generationStartedAt={
                          generatingMessageId === message.id
                            ? generationStartedAt
                            : null
                        }
                        comicDrama={Boolean(message.comicDrama)}
                        mediaType={message.result.mediaType}
                        count={message.result.generationCount}
                        progressLabel={
                          generatingMessageId === message.id
                            ? activity
                            : undefined
                        }
                        onRefine={() => textareaRef.current?.focus()}
                        onGenerate={() => void confirmGeneration(message)}
                      />
                    ) : null}
                    {!message.streaming && generatingMessageId !== message.id && message.content.trim() ? <div className="create-chat-message-actions">
                      <button
                        type="button"
                        className="create-chat-icon-button"
                        onClick={() =>
                          void copyMessage(message.id, message.content)
                        }
                        aria-label={uiText("复制回复")}
                        title={uiText("复制回复")}
                      >
                        {copiedMessageId === message.id ? (
                          <Check size={16} />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div> : null}
                  </AssistantMessageFrame>
                ) : (
                  <article
                    key={message.id}
                    className="create-chat-result"
                    aria-label={uiText("创作结果")}
                  >
                    {message.result.videos?.length ? (
                      <div
                        className="create-chat-result-images"
                        data-single="true"
                      >
                        {message.result.videos.map((video) => (
                          <video
                            key={video.id}
                            controls
                            preload="metadata"
                            src={video.url}
                            aria-label={uiText("生成的视频")}
                          />
                        ))}
                      </div>
                    ) : message.result.images.length > 0 ? (
                      <div
                        className="create-chat-result-images"
                        data-single={message.result.images.length === 1}
                      >
                        {message.result.images.map((image, index) => (
                          <button
                            key={image.id}
                            type="button"
                            onClick={() => openCreationBoard(message.result.boardId)}
                            aria-label={uiText(
                              "打开画板查看第 {{ui:0}} 张生成图片",
                              [index + 1],
                            )}
                          >
                            <img
                              src={image.dataUrl}
                              alt={uiText("生成结果 {{ui:0}}", [index + 1])}
                            />
                            <span className="create-chat-image-open">
                              <ArrowUpRight size={18} />
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="create-chat-result-note">
                        {message.result.videoJobId ? (
                          <Film size={20} />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                        <p>
                          {message.result.videoJobId
                            ? uiText(
                                message.result.videoPending
                                  ? "视频任务已提交，远端仍在处理中，可打开画板查看进度。"
                                  : "视频已生成，可打开画板播放。",
                              )
                            : message.result.comicDrama
                              ? uiText(
                                  "已添加 1 张漫剧设定卡，并打开通用漫剧助手。本步未创建角色、片段或媒体节点，不产生媒体费用。",
                                )
                              : uiText(
                                  "没有生成可用图片，请检查模型配置后重试。",
                                )}
                        </p>
                      </div>
                    )}
                    <div className="create-chat-result-footer">
                      <p>
                        <Check size={15} />
                        <span>
                          {message.result.comicDrama
                            ? uiText("已在普通画板中开始")
                            : message.result.videoPending
                              ? uiText("视频任务已提交到")
                              : uiText("已生成并保存到")}
                          「{message.result.boardName}」
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => openCreationBoard(message.result.boardId)}
                      >
                        {uiText("打开画板")}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </article>
                ),
              )}
              {showWaitingStatus ? (
                <div className="create-chat-thinking" role="status">
                  <span className="create-chat-thinking-dot" />
                  <span>{uiText(activity || "正在梳理需求…")}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="create-chat-compose-area" onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }} onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          void addReferenceFiles(event.dataTransfer.files);
        }}>
          {queued.length ? <div className="creation-queue" aria-label={uiText("待处理补充")}>
            <span>{uiText("下一轮处理")} · {queued.length}</span>
            {queuePaused ? <button type="button" className="creation-queue-resume" onClick={() => setQueuePaused(false)}>{uiText("继续处理补充")}</button> : null}
            {queued.map((item, index) => <div key={`${index}-${item}`} className="creation-queue-item">
              <p>{item}</p><button type="button" aria-label={uiText("编辑待处理补充")} onClick={() => {
                setEditingQueueIndex(index); setValue(item); textareaRef.current?.focus();
              }}><Pencil size={14} /></button>
              <button type="button" aria-label={uiText("移除待处理补充")} onClick={() => setQueued((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
            </div>)}
          </div> : null}
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => {
            if (event.target.files) void addReferenceFiles(event.target.files);
            event.target.value = "";
          }} />
          {showScrollButton && !isEmpty ? (
            <button
              type="button"
              className="create-chat-jump"
              aria-label={uiText("回到最新消息")}
              onClick={scrollToLatest}
            >
              <ArrowDown size={18} />
            </button>
          ) : null}
          <AssistantComposerFrame data-busy={busy}>
            {references.length ? <div className="creation-reference-rail" aria-label={uiText("创作参考素材")}>
              {references.map((reference) => <div key={reference.id} className="creation-reference-item" title={reference.name}>
                {reference.kind === "template" ? <div className="creation-reference-template"><LayoutGrid size={18} /><span>{reference.name}</span></div>
                  : <button type="button" className="creation-reference-preview-trigger"
                    aria-label={uiText("预览素材：{{ui:0}}", [reference.name])} onClick={() => void openReferencePreview(reference)}>
                    {reference.previewUrl ? <img src={reference.previewUrl} alt="" /> : <ImageIcon size={20} />}
                  </button>}
                {reference.kind !== "template" ? <select value={reference.role} aria-label={uiText("素材用途：{{ui:0}}", [reference.name])}
                  onChange={(event) => setReferences((current) => current.map((item) => item.id === reference.id
                    ? { ...item, role: event.target.value as CreationReference["role"] } : item))}>
                  <option value="reference">{uiText("参考风格")}</option><option value="edit-target">{uiText("编辑主体")}</option>
                </select> : null}
                <button type="button" className="creation-reference-remove" aria-label={uiText("移除素材：{{ui:0}}", [reference.name])}
                  onClick={() => { setReferences((current) => current.filter((item) => item.id !== reference.id));
                    setPreviewReference((current) => current?.id === reference.id ? null : current); }}><X size={12} /></button>
              </div>)}
            </div> : null}
            {editingMessageId ? (
              <div className="create-chat-editing">
                <span>
                  <Pencil size={14} />
                  {uiText("编辑消息")}
                </span>
                <button
                  type="button"
                  aria-label={uiText("取消编辑")}
                  onClick={() => {
                    setEditingMessageId(null);
                    setValue("");
                    textareaRef.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : null}
            <label className="sr-only" htmlFor="create-chat-input">
              {uiText("描述想要创建的内容")}
            </label>
            <textarea
              ref={textareaRef}
              id="create-chat-input"
              value={value}
              rows={1}
              autoFocus
              disabled={Boolean(agentInteraction)}
              placeholder={
                isEmpty
                  ? uiText("描述你想创作的内容…")
                  : uiText("继续补充或调整创作想法…")
              }
              onChange={(event) => setValue(event.target.value)}
              onPaste={(event) => {
                const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
                if (files.length) { event.preventDefault(); void addReferenceFiles(files); }
              }}
              onKeyDown={(event) => {
                if (!isSendEnter(event)) return;
                event.preventDefault();
                void submit();
              }}
            />
            <AssistantComposerToolbar>
              <DropdownMenu onOpenChange={(open) => { if (open) void loadAssetChoices().catch(() => undefined); }}>
                <DropdownMenuTrigger asChild><button type="button" className="create-chat-icon-button" aria-label={uiText("添加创作素材")}
                  disabled={references.length >= 4}><Paperclip size={17} /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="max-h-80 w-64 overflow-y-auto">
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>{uiText("上传图片")}</DropdownMenuItem>
                  {targetBoardId ? <DropdownMenuItem onSelect={() => void addBoardReference()}>{uiText("引用当前画板")}</DropdownMenuItem> : null}
                  {artifacts.filter((item) => item.kind === "image" && item.path).slice(-3).reverse().map((artifact) =>
                    <DropdownMenuItem key={artifact.id} onSelect={() => setReferences((current) => [...current,
                      { id: crypto.randomUUID(), kind: "artifact", role: "reference", name: `${artifact.boardName} · 上一版`, mimeType: "image/png",
                        boardId: artifact.boardId, nodeId: artifact.nodeId, imagePath: artifact.path } as CreationReference].slice(0, 4))}>{uiText("引用上一版")} · {artifact.boardName}</DropdownMenuItem>)}
                  {assetChoices.slice(0, 8).map((item) => <DropdownMenuItem key={`${item.boardId}:${item.nodeId}`} onSelect={() => addAssetReference(item)}>
                    {uiText("素材")}: {item.boardName}</DropdownMenuItem>)}
                  {scenes.slice(0, 8).map((scene) => <DropdownMenuItem key={scene.id} onSelect={() => addTemplateReference(scene)}>
                    {uiText("模板")}: {scene.name}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu onOpenChange={(open) => { if (open) setBoardSearchQuery(""); }}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="create-chat-target"
                  >
                    {selectedBoard ? (
                      <LayoutGrid size={18} strokeWidth={1.7} />
                    ) : (
                      <Plus size={20} strokeWidth={1.7} />
                    )}
                    <span>{uiText(targetLabel)}</span>
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  sideOffset={10}
                  className="w-64 rounded-xl p-1.5"
                >
                  <DropdownMenuLabel>{uiText("生成到")}</DropdownMenuLabel>
                  {boards.length > 0 ? (
                    <div className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-md border border-border px-2 text-muted-foreground" role="search">
                      <Search size={14} aria-hidden="true" />
                      <input
                        type="search"
                        value={boardSearchQuery}
                        placeholder={uiText("搜索画板")}
                        aria-label={uiText("搜索画板")}
                        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                        onChange={(event) => setBoardSearchQuery(event.target.value)}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    </div>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setTargetBoardId(null)}>
                    <Plus className="h-4 w-4" />
                    <span className="flex-1">{uiText("新建画板")}</span>
                    {!targetBoardId ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenuItem>
                  {boards.length > 0 ? <DropdownMenuSeparator /> : null}
                  {filteredBoards.map((board) => (
                    <DropdownMenuItem
                      key={board.id}
                      onSelect={() => setTargetBoardId(board.id)}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">
                        {board.name}
                      </span>
                      {targetBoardId === board.id ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                      {board.id === activeBoardId &&
                      targetBoardId !== board.id ? (
                        <span className="text-[10px] text-muted-foreground">
                          {uiText("当前")}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                  {boards.length > 0 && filteredBoards.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">{uiText("没有匹配的画板")}</div>
                  ) : null}
                  {boards.length === 0 ? (
                    <DropdownMenuItem onSelect={onOpenSettings}>
                      {uiText("生成后可在画板库中继续整理")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              {composerMediaType === "video" ? (
                <button
                  type="button"
                  className="create-chat-model"
                  disabled={busy}
                  onClick={onOpenSettings}
                  aria-label={uiText("管理视频模型")}
                >
                  <span>{activeVideoModelLabel || uiText("配置视频模型")}</span>
                </button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={busy}
                      className="create-chat-model"
                      aria-label={uiText("选择图片模型")}
                    >
                      <span>
                        {activeImageModel ||
                          imageProviders.find(
                            (provider) => provider.id === activeImageProviderId,
                          )?.model ||
                          uiText("选择图片模型")}
                      </span>
                      <ChevronDown size={13} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    sideOffset={10}
                    className="create-chat-model-menu w-64 max-h-72 overflow-y-auto"
                  >
                    <DropdownMenuLabel>{uiText("图片模型")}</DropdownMenuLabel>
                    {imageProviders.map((provider) => (
                      <DropdownMenuGroup key={provider.id}>
                        <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
                        {getProviderModels(provider).map((model) => (
                          <DropdownMenuItem
                            key={model}
                            onSelect={() =>
                              onSelectImageModel?.(provider.id, model)
                            }
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {model}
                            </span>
                            {provider.id === activeImageProviderId &&
                            model === (activeImageModel || provider.model) ? (
                              <Check className="size-3.5" aria-hidden="true" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={onOpenSettings}>
                        {uiText("管理模型")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={(!value.trim() && !hasImageReferences) || Boolean(agentInteraction)}
                aria-label={uiText("发送给 Pi Agent")}
                title={uiText(editingQueueIndex !== null ? "保存补充" : interpreting && canSteer && !mediaToolStarted && !agentInteraction ? "补充当前执行" : busy ? "加入下一轮" : "发送消息")}
                className="create-chat-send"
              >
                <ArrowUp size={21} strokeWidth={2} />
              </button>
            </AssistantComposerToolbar>
          </AssistantComposerFrame>
          <p className="create-chat-composer-hint" role="status">
            {copyFailed
              ? uiText("复制失败，请选择文字后手动复制。")
              : copiedMessageId
                ? uiText("已复制")
                : uiText("Enter 发送，Shift + Enter 换行")}
          </p>
        </div>

        {isEmpty ? (
          <div
            className="create-chat-starters"
            aria-busy={starterPromptsLoading}
          >
            <div className="create-chat-starter-list">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setValue(prompt);
                    textareaRef.current?.focus();
                  }}
                >
                  {prompt}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                void loadStarterPrompts("divergent", starterPrompts)
              }
              disabled={starterPromptsLoading}
              aria-label={uiText("换一批灵感")}
              className="create-chat-refresh"
            >
              <RefreshCw
                size={14}
                className={cn(
                  starterPromptsLoading &&
                    "animate-spin motion-reduce:animate-none",
                )}
              />
              {uiText("换一批")}
            </button>
          </div>
        ) : null}
      </div>

    </section>
    {showArtifacts && artifacts.length ? <CreationArtifactPanel artifacts={artifacts}
      onUpdate={(artifact, siblings = []) => setArtifacts((current) => [
        ...current.filter((item) => item.id !== artifact.id && !siblings.some((extra) => extra.id === item.id)), artifact, ...siblings
      ])}
      onClose={() => setShowArtifacts(false)} onOpenBoard={openCreationBoard}
      onRefine={(artifact) => {
        setValue(`基于「${artifact.boardName}」的${artifact.mediaType === "video" || artifact.kind === "video" ? "视频" : "作品"}继续修改：`);
        if (window.matchMedia("(max-width: 1120px)").matches) setShowArtifacts(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }} /> : null}
    <Dialog open={Boolean(previewReference)} onOpenChange={(open) => { if (!open) setPreviewReference(null); }}>
      <DialogContent className="creation-reference-dialog">
        <DialogTitle>{previewReference?.name}</DialogTitle>
        <DialogDescription>{uiText("创作参考素材")}</DialogDescription>
        {previewReference?.url ? <img src={previewReference.url} alt={previewReference.name} />
          : <div className="creation-reference-preview-unavailable"><ImageIcon size={24} />{uiText("素材暂时不可预览")}</div>}
      </DialogContent>
    </Dialog>
    </div>
  );
}

