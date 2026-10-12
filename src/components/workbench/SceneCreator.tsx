import { lazy, Suspense, useEffect, useId, useRef, useState, type ClipboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssistantIntentSuggestionCount,
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GptImageUseCase,
  ImageQuality,
  ImageWorkflowMode,
  ReferenceImagePayload,
  SceneAssistantReference,
  SceneMediaResult,
  SceneMediaSummary
} from "@shared/types";
import { getDefaultUseCase } from "@shared/workflow";
import { Button } from "@/components/ui/button";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import { isSendEnter } from "@/lib/send-on-enter";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import type {
  AiAssistantInteractionState,
  AiAssistantInteractionValues,
  AiAssistantContextImage,
  AiAssistantMessage
} from "@/components/assistant/AiAssistant";
import {
  buildTemplateAssistantConfirmationPreview,
  buildTemplateExampleReviewConfirmationPreview,
  formatAssistantInteractionAnswers,
  resolveAssistantInteraction
} from "@/lib/assistant-interaction";
import {
  applySceneFieldSuggestion,
  buildSceneAssistantGreeting,
  buildSceneFieldSuggestions,
  clearSceneCreatorDraft,
  compactSceneFields,
  createEmptySceneFields,
  createSceneDraft,
  createSceneDraftFromScene,
  isDefaultEmptySceneFields,
  readSceneCreatorDraft,
  resolveSceneAssistantInstruction,
  routeTemplateAssistantIntent,
  SCENE_CREATOR_MAX_REFERENCE_COUNT,
  sceneDraftCompletion,
  templateAssistantReferenceSuggestions,
  templateAssistantStarterSuggestions,
  type SceneDraft,
  writeSceneCreatorDraft
} from "@/lib/scene-creator";
import {
  getTemplateExtractionScenarioTemplateLabel,
  normalizeSceneConversation,
  SCENE_CATEGORY_LABELS,
  serializeSceneFields,
  type NewSceneInput,
  type SceneDefinition,
  type SceneField
} from "@/lib/scene-library";
import type { SceneGenerationDefaults } from "@/lib/scene-media";
import {
  startSceneCollaborationStream,
  type SceneCollaborationStreamHandle
} from "@/lib/scene-collaboration-stream";
import {
  buildTemplateExampleRecommendationInstruction,
  buildTemplateExampleReviewInstruction,
  extractTemplateExampleRecommendation
} from "@/lib/template-workflow";
import {
  finishActiveSceneGeneration,
  startActiveSceneGeneration,
  useActiveSceneGeneration
} from "@/lib/active-scene-generation";
import { GENERATION_ESTIMATE_MS, getGenerationTiming, type GenerationTiming } from "@/lib/generation-timing";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

const loadAiAssistant = () =>
  import("@/components/assistant/AiAssistant").then((module) => ({ default: module.AiAssistant }));
const AiAssistant = lazy(loadAiAssistant);

const SUPPORTED_ASSISTANT_REFERENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const MAX_ASSISTANT_REFERENCE_BYTES = 20 * 1024 * 1024;
const TEMPLATE_INTENT_SUGGESTION_COUNT: AssistantIntentSuggestionCount = 3;

function useSceneGenerationTiming(startedAt?: number): GenerationTiming | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (startedAt === undefined) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === undefined ? null : getGenerationTiming(startedAt, now);
}

interface SceneCreatorReference extends SceneAssistantReference {
  id: string;
  previewUrl: string;
  fingerprint: string;
}

interface ExampleImageLightbox {
  src: string;
  alt: string;
  sourceRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  imageWidth?: number;
  imageHeight?: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取“${file.name}”。`));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取模板示例。"));
    reader.readAsDataURL(blob);
  });
}

function sceneReferenceFromDataUrl(dataUrl: string, name: string): SceneAssistantReference | null {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) return null;
  return { name, mimeType: match[1], dataBase64: match[2] };
}

interface SceneCreatorProps {
  boardId?: string;
  currentPrompt: string;
  initialScene?: SceneDefinition;
  initialWorkflowMode: ImageWorkflowMode;
  initialUseCase: GptImageUseCase;
  generationDefaults: SceneGenerationDefaults;
  canOptimize: boolean;
  canCollaborate: boolean;
  onCollaborate: (input: Omit<CollaborateSceneRequest, "providerId">) => Promise<CollaborateSceneResult>;
  onOptimize: (scene: SceneDefinition, prompt: string, templatePrompt?: string) => Promise<string>;
  onSave: (input: NewSceneInput) => SceneDefinition;
  onUpdate: (scene: SceneDefinition, input: NewSceneInput) => SceneDefinition;
  onDelete: (id: string) => void;
  onCreated: (scene: SceneDefinition) => void;
  onCancel: () => void;
  onMediaChange: () => Promise<void>;
  onOpenSettings: () => void;
  mediaBySceneId?: Record<string, SceneMediaSummary>;
}

type GenerationCount = 1 | 2 | 3;

interface ExampleSourceImage {
  payload: ReferenceImagePayload;
  previewUrl: string;
}

const EXAMPLE_SIZE_OPTIONS = [
  { value: "auto", label: "自动尺寸" },
  { value: "1024x1024", label: "1024 x 1024" },
  { value: "1536x1024", label: "1536 x 1024" },
  { value: "1024x1536", label: "1024 x 1536" },
  { value: "2048x2048", label: "2048 x 2048" },
  { value: "2048x1152", label: "2048 x 1152" },
  { value: "3840x2160", label: "3840 x 2160" },
  { value: "2160x3840", label: "2160 x 3840" }
] as const;

const EXAMPLE_QUALITY_OPTIONS: Array<{ value: ImageQuality; label: string }> = [
  { value: "auto", label: "自动质量" },
  { value: "low", label: "低质量" },
  { value: "medium", label: "标准质量" },
  { value: "high", label: "高质量" }
];

const CATEGORY_OPTIONS = Object.entries(SCENE_CATEGORY_LABELS) as Array<[SceneDraft["category"], string]>;

const WORKFLOW_OPTIONS: Array<{
  value: ImageWorkflowMode;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { value: "generate", label: "图片生成", icon: ImageIcon },
  { value: "edit", label: "图片编辑", icon: Pencil }
];

export function SceneCreator({
  boardId,
  currentPrompt,
  initialScene,
  initialWorkflowMode,
  initialUseCase,
  generationDefaults,
  canOptimize,
  canCollaborate,
  onCollaborate,
  onOptimize,
  onSave,
  onUpdate,
  onDelete,
  onCreated,
  onCancel,
  onMediaChange,
  onOpenSettings,
  mediaBySceneId = {}
}: SceneCreatorProps): React.ReactElement {
  const indicatorId = useId();
  const [draft, setDraft] = useState<SceneDraft>(() => {
    const initialDraft = initialScene
      ? createSceneDraftFromScene(initialScene)
      : readSceneCreatorDraft() ?? createSceneDraft(currentPrompt, initialWorkflowMode, initialUseCase);
    return isDefaultEmptySceneFields(initialDraft.fields, initialDraft.mode)
      ? { ...initialDraft, fields: [], revision: initialDraft.revision + 1 }
      : initialDraft;
  });
  const [persistedScene, setPersistedScene] = useState<SceneDefinition | null>(initialScene ?? null);
  const [exampleBrief, setExampleBrief] = useState("");
  const [examplePrompt, setExamplePrompt] = useState("");
  const [exampleImages, setExampleImages] = useState<string[]>([]);
  const [exampleImageLightbox, setExampleImageLightbox] = useState<ExampleImageLightbox | null>(null);
  const [exampleSourceImage, setExampleSourceImage] = useState<ExampleSourceImage | null>(null);
  const [exampleSize, setExampleSize] = useState(generationDefaults.size);
  const [exampleQuality, setExampleQuality] = useState<ImageQuality>(generationDefaults.quality ?? "auto");
  const [exampleCount, setExampleCount] = useState<GenerationCount>(1);
  const [generatingExample, setGeneratingExample] = useState(false);
  const activeExampleGeneration = useActiveSceneGeneration(persistedScene?.id);
  const exampleGenerationTiming = useSceneGenerationTiming(activeExampleGeneration?.startedAt);
  const exampleGenerationActive = generatingExample || Boolean(activeExampleGeneration);
  const [recommendingExample, setRecommendingExample] = useState(false);
  const [reviewingExample, setReviewingExample] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantActivity, setAssistantActivity] = useState<string | null>(null);
  const restoredAssistantConversation = normalizeSceneConversation(initialScene?.conversation);
  const hasRestoredAssistantConversation = restoredAssistantConversation.some(
    (message) => message.role === "user"
  );
  const [assistantMessages, setAssistantMessages] = useState<AiAssistantMessage[]>(() => (
    restoredAssistantConversation.length > 0
      ? restoredAssistantConversation
      : [{
          id: crypto.randomUUID(),
          role: "assistant",
          content: buildSceneAssistantGreeting(draft)
        }]
  ));
  const [assistantReferences, setAssistantReferences] = useState<SceneCreatorReference[]>([]);
  const [assistantExampleReferences, setAssistantExampleReferences] = useState<SceneCreatorReference[]>([]);
  const [assistantExamplesOpen, setAssistantExamplesOpen] = useState(false);
  const [loadingAssistantExampleIds, setLoadingAssistantExampleIds] = useState<Set<string>>(() => new Set());
  const [assistantIntentSuggestions, setAssistantIntentSuggestions] = useState<string[]>(
    hasRestoredAssistantConversation ? [] : templateAssistantStarterSuggestions(draft.extractionScenario)
  );
  const [assistantIntentSuggestionsLoading, setAssistantIntentSuggestionsLoading] = useState(false);
  const [assistantHasSubmitted, setAssistantHasSubmitted] = useState(hasRestoredAssistantConversation);
  const [assistantInteraction, setAssistantInteraction] = useState<{
    state: AiAssistantInteractionState;
    result?: CollaborateSceneResult;
    messageId?: string;
    requestDraft?: SceneDraft;
    agentInteractionId?: string;
  } | null>(null);
  const requestVersionRef = useRef(0);
  const draftRef = useRef(draft);
  const assistantStreamRef = useRef<SceneCollaborationStreamHandle | null>(null);
  const assistantReferenceInputRef = useRef<HTMLInputElement>(null);
  const assistantReferencesRef = useRef<SceneCreatorReference[]>([]);
  const assistantExampleReferencesRef = useRef<SceneCreatorReference[]>([]);
  const assistantApplyTimerRef = useRef<number | null>(null);
  const assistantClarificationRoundsRef = useRef(0);
  const assistantIntentSuggestionRequestRef = useRef(0);
  const assistantIntentSuggestionHistoryRef = useRef<string[]>([]);
  const requestAssistantIntentSuggestionsRef = useRef<(
    mode?: "contextual" | "divergent"
  ) => Promise<void>>(async () => undefined);
  const reduceMotion = Boolean(useReducedMotion());
  const completion = sceneDraftCompletion(draft);
  const canSave = draft.name.trim().length > 0 && completion.filled > 0;
  const availableAssistantExamples = persistedScene
    ? mediaBySceneId[persistedScene.id]?.results ?? []
    : [];
  const selectedAssistantExampleIds = new Set(
    assistantExampleReferences.map((reference) => reference.id.replace(/^example:/u, ""))
  );
  const assistantReferenceCount = assistantReferences.length + assistantExampleReferences.length;
  const assistantContextImages: AiAssistantContextImage[] = [
    ...assistantReferences.map((reference) => ({
      id: reference.id,
      src: reference.previewUrl,
      alt: reference.name,
      role: "reference" as const,
      onRemove: () => removeAssistantReference(reference.id)
    })),
    ...assistantExampleReferences.map((reference) => ({
      id: reference.id,
      src: reference.previewUrl,
      alt: reference.name,
      role: "reference" as const,
      onRemove: () => removeAssistantExampleReference(reference.id)
    }))
  ];

  useEffect(() => {
    draftRef.current = draft;
    if (!initialScene && !persistedScene) writeSceneCreatorDraft(draft);
  }, [draft, initialScene, persistedScene]);

  useEffect(() => {
    setExampleSize(generationDefaults.size);
    setExampleQuality(generationDefaults.quality ?? "auto");
  }, [generationDefaults.quality, generationDefaults.size]);

  useEffect(() => {
    if (draft.mode === "generate") setExampleSourceImage(null);
  }, [draft.mode]);

  useEffect(() => {
    const content = draft.fields
      .map((field) => `${field.label.trim()}：${field.value.trim()}`)
      .filter((line) => !line.endsWith("："))
      .join("\n");
    if (!content) return;
    const timer = window.setTimeout(() => {
      void getImageWorkbenchApi().checkpointPromptDraft(
        content,
        "scene-template",
        boardId ? { boardId } : undefined
      ).catch(() => undefined);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [boardId, draft.fields]);

  useEffect(() => () => {
    requestVersionRef.current += 1;
    assistantIntentSuggestionRequestRef.current += 1;
    assistantStreamRef.current?.dispose();
    if (assistantApplyTimerRef.current !== null) window.clearTimeout(assistantApplyTimerRef.current);
  }, []);

  useEffect(() => {
    requestAssistantIntentSuggestionsRef.current = requestAssistantIntentSuggestions;
  });

  useEffect(() => {
    if (
      !assistantHasSubmitted ||
      !canCollaborate ||
      assistantLoading ||
      assistantActivity ||
      assistantInteraction
    ) return;
    const timer = window.setTimeout(() => {
      void requestAssistantIntentSuggestionsRef.current();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    assistantActivity,
    assistantHasSubmitted,
    assistantInteraction,
    assistantLoading,
    assistantMessages,
    assistantReferences.length,
    assistantExampleReferences.length,
    canCollaborate,
    draft.revision
  ]);

  function updateDraft(patch: Partial<SceneDraft>): void {
    setDraft((current) => ({ ...current, ...patch, revision: current.revision + 1 }));
  }

  function changeWorkflowMode(mode: ImageWorkflowMode): void {
    setDraft((current) => {
      if (current.mode === mode) return current;
      const hasContent = current.fields.some((field) => field.value.trim());
      return {
        ...current,
        mode,
        useCase: getDefaultUseCase(mode),
        category: mode === "edit" ? "editing" : current.category === "editing" ? "other" : current.category,
        fields: hasContent ? current.fields : createEmptySceneFields(mode),
        revision: current.revision + 1
      };
    });
  }

  function updateField(id: string, patch: Partial<Pick<SceneField, "label" | "value">>): void {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
      revision: current.revision + 1
    }));
  }

  function addField(): void {
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, { id: crypto.randomUUID(), label: "新字段", value: "" }],
      revision: current.revision + 1
    }));
  }

  function removeField(id: string): void {
    if (draft.fields.length <= 1) {
      toast("至少保留 1 个提示词字段。");
      return;
    }
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== id),
      revision: current.revision + 1
    }));
  }

  async function addAssistantReferences(files: File[]): Promise<void> {
    const current = assistantReferencesRef.current;
    const available = SCENE_CREATOR_MAX_REFERENCE_COUNT
      - current.length
      - assistantExampleReferencesRef.current.length;
    if (available <= 0) {
      toast(`最多添加 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张参考图。`);
      return;
    }

    const existing = new Set(current.map((reference) => reference.fingerprint));
    const candidates = files.filter((file) => {
      if (!SUPPORTED_ASSISTANT_REFERENCE_TYPES.has(file.type)) {
        toast.error(`“${file.name}”格式不受支持，请使用 PNG、JPEG、WebP 或 GIF。`);
        return false;
      }
      if (file.size > MAX_ASSISTANT_REFERENCE_BYTES) {
        toast.error(`“${file.name}”超过 20 MB，请压缩后重试。`);
        return false;
      }
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(fingerprint)) return false;
      existing.add(fingerprint);
      return true;
    }).slice(0, available);

    if (candidates.length === 0) return;
    try {
      const added = await Promise.all(candidates.map(async (file): Promise<SceneCreatorReference> => {
        const previewUrl = await readFileAsDataUrl(file);
        const commaIndex = previewUrl.indexOf(",");
        return {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type,
          dataBase64: previewUrl.slice(commaIndex + 1),
          previewUrl,
          fingerprint: `${file.name}:${file.size}:${file.lastModified}`
        };
      }));
      const next = [...assistantReferencesRef.current, ...added]
        .slice(0, SCENE_CREATOR_MAX_REFERENCE_COUNT);
      assistantReferencesRef.current = next;
      setAssistantReferences(next);
      if (!assistantHasSubmitted && current.length === 0 && next.length > 0) {
        setAssistantIntentSuggestions(templateAssistantReferenceSuggestions(draftRef.current.extractionScenario));
      }
      if (files.length > available) {
        toast(`已添加 ${added.length} 张，最多支持 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张参考图。`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取参考图。");
    }
  }

  function removeAssistantReference(id: string): void {
    const next = assistantReferencesRef.current.filter((reference) => reference.id !== id);
    assistantReferencesRef.current = next;
    setAssistantReferences(next);
    if (!assistantHasSubmitted && next.length === 0 && assistantExampleReferencesRef.current.length === 0) {
      setAssistantIntentSuggestions(templateAssistantStarterSuggestions(draftRef.current.extractionScenario));
    }
  }

  function removeAssistantExampleReference(id: string): void {
    const next = assistantExampleReferencesRef.current.filter((reference) => reference.id !== id);
    assistantExampleReferencesRef.current = next;
    setAssistantExampleReferences(next);
    if (!assistantHasSubmitted && next.length === 0 && assistantReferencesRef.current.length === 0) {
      setAssistantIntentSuggestions(templateAssistantStarterSuggestions(draftRef.current.extractionScenario));
    }
  }

  async function toggleAssistantExample(result: SceneMediaResult, index: number): Promise<void> {
    const referenceId = `example:${result.id}`;
    if (assistantExampleReferencesRef.current.some((reference) => reference.id === referenceId)) {
      removeAssistantExampleReference(referenceId);
      return;
    }
    if (
      assistantReferencesRef.current.length + assistantExampleReferencesRef.current.length
      >= SCENE_CREATOR_MAX_REFERENCE_COUNT
    ) {
      toast(`AI 助手最多查看 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张图片，请先移除一张。`);
      return;
    }
    if (loadingAssistantExampleIds.has(result.id)) return;

    setLoadingAssistantExampleIds((current) => new Set(current).add(result.id));
    try {
      const response = await fetch(result.imageUrl);
      if (!response.ok) throw new Error("无法读取这张模板示例。");
      const dataUrl = await readBlobAsDataUrl(await response.blob());
      const reference = sceneReferenceFromDataUrl(dataUrl, `模板示例 ${index + 1}`);
      if (!reference) throw new Error("这张模板示例的格式暂不受支持。");
      if (
        assistantReferencesRef.current.length + assistantExampleReferencesRef.current.length
        >= SCENE_CREATOR_MAX_REFERENCE_COUNT
      ) {
        toast(`AI 助手最多查看 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张图片，请先移除一张。`);
        return;
      }
      const next = [
        ...assistantExampleReferencesRef.current,
        {
          ...reference,
          id: referenceId,
          previewUrl: result.imageUrl,
          fingerprint: referenceId
        }
      ];
      assistantExampleReferencesRef.current = next;
      setAssistantExampleReferences(next);
      if (!assistantHasSubmitted && next.length === 1 && assistantReferencesRef.current.length === 0) {
        setAssistantIntentSuggestions(templateAssistantReferenceSuggestions(draftRef.current.extractionScenario));
      }
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法把这张示例提供给 AI 助手。"));
    } finally {
      setLoadingAssistantExampleIds((current) => {
        const next = new Set(current);
        next.delete(result.id);
        return next;
      });
    }
  }

  function currentAssistantReferences(): SceneCreatorReference[] {
    return [...assistantReferencesRef.current, ...assistantExampleReferencesRef.current];
  }

  async function requestAssistantIntentSuggestions(
    mode: "contextual" | "divergent" = "contextual"
  ): Promise<void> {
    if (
      !assistantHasSubmitted ||
      !canCollaborate ||
      assistantLoading ||
      assistantActivity ||
      assistantInteraction
    ) return;

    const requestId = assistantIntentSuggestionRequestRef.current + 1;
    assistantIntentSuggestionRequestRef.current = requestId;
    setAssistantIntentSuggestionsLoading(true);
    try {
      const currentDraft = draftRef.current;
      const result = await getImageWorkbenchApi().suggestAssistantIntents({
        assistantSurface: "scene-template",
        templateWorkflow: "create",
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-12)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        currentFields: currentDraft.fields
          .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
          .filter((field) => field.label),
        templateScenario: currentDraft.extractionScenario,
        referenceImageCount: currentAssistantReferences().length,
        suggestionCount: TEMPLATE_INTENT_SUGGESTION_COUNT,
        suggestionMode: mode,
        previousSuggestions: mode === "divergent" ? assistantIntentSuggestionHistoryRef.current : []
      });
      if (assistantIntentSuggestionRequestRef.current !== requestId) return;
      assistantIntentSuggestionHistoryRef.current = mode === "divergent"
        ? [...assistantIntentSuggestionHistoryRef.current, ...result.suggestions].slice(-20)
        : result.suggestions;
      setAssistantIntentSuggestions(result.suggestions);
    } catch {
      if (assistantIntentSuggestionRequestRef.current !== requestId) return;
      if (mode === "contextual") setAssistantIntentSuggestions([]);
    } finally {
      if (assistantIntentSuggestionRequestRef.current === requestId) {
        setAssistantIntentSuggestionsLoading(false);
      }
    }
  }

  function applyAssistantResult(
    result: CollaborateSceneResult,
    requestDraft: SceneDraft,
    assistantMessageId: string
  ): void {
    const beforeApply = draftRef.current;
    const suggestions = buildSceneFieldSuggestions(requestDraft.fields, result.fields);
    let changedCount = 0;
    let nextDraft = beforeApply;

    if (beforeApply.mode === requestDraft.mode) {
      const fields = suggestions.reduce((currentFields, suggestion) => {
        if (!suggestion.fieldId) {
          changedCount += 1;
          return applySceneFieldSuggestion(currentFields, suggestion);
        }
        const currentField = currentFields.find((field) => field.id === suggestion.fieldId);
        if (!currentField || currentField.value !== suggestion.before) return currentFields;
        changedCount += 1;
        return applySceneFieldSuggestion(currentFields, suggestion);
      }, beforeApply.fields);
      const name = beforeApply.name.trim() ? beforeApply.name : result.suggestedName?.trim() || beforeApply.name;
      const description = beforeApply.description.trim()
        ? beforeApply.description
        : result.suggestedDescription?.trim() || beforeApply.description;
      if (name !== beforeApply.name) changedCount += 1;
      if (description !== beforeApply.description) changedCount += 1;
      nextDraft = { ...beforeApply, name, description, fields, revision: beforeApply.revision + 1 };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }

    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
            ...message,
            content: message.content.trim() || result.message,
            streaming: false,
            ...(changedCount > 0 ? {
              receipt: {
                label: `已更新 ${changedCount} 处内容`,
                actions: [{
                  label: "撤销",
                  kind: "undo" as const,
                  onAction: () => {
                    assistantStreamRef.current?.dispose();
                    draftRef.current = beforeApply;
                    setDraft(beforeApply);
                    setAssistantMessages((messages) => messages.map((item) => (
                      item.id === assistantMessageId ? { ...item, receipt: undefined } : item
                    )));
                    toast("已撤销这轮修改。");
                  }
                }]
              }
            } : {})
          }
        : message
    )));
    setAssistantLoading(false);
    setAssistantActivity(null);
    setAssistantInteraction(null);
    assistantStreamRef.current = null;
    assistantApplyTimerRef.current = null;
  }

  function receiveAssistantResult(
    result: CollaborateSceneResult,
    requestDraft: SceneDraft,
    assistantMessageId: string,
    options?: {
      messageContent?: string;
      assistantContext?: string;
      confirmationPreview?: AiAssistantInteractionState["confirmationPreview"];
    }
  ): void {
    setAssistantMessages((current) => current.map((message) => (
      message.id === assistantMessageId
        ? {
            ...message,
            content: options?.messageContent ?? result.message,
            ...(options?.assistantContext ? { assistantContext: options.assistantContext } : {}),
            streaming: false
          }
        : message
    )));
    setAssistantLoading(false);
    assistantStreamRef.current = null;

    const interaction = resolveAssistantInteraction(result, "scene-template");
    if (interaction?.type === "form") assistantClarificationRoundsRef.current += 1;
    else assistantClarificationRoundsRef.current = 0;
    setAssistantInteraction(interaction ? {
      state: {
        id: crypto.randomUUID(),
        interaction,
        ...(interaction.type === "confirm" ? {
          confirmationPreview: options?.confirmationPreview ?? buildTemplateAssistantConfirmationPreview(result, {
            name: requestDraft.name,
            description: requestDraft.description,
            fields: requestDraft.fields
          })
        } : {})
      },
      result,
      messageId: assistantMessageId,
      requestDraft
    } : null);
  }

  function sendAssistantInstruction(
    instructionValue: string,
    displayContent = instructionValue,
    templateIntent?: CollaborateSceneRequest["templateIntent"]
  ): void {
    const instruction = instructionValue.trim();
    if (!canCollaborate) {
      toast.error("请先配置支持文本能力的 Provider。");
      onOpenSettings();
      return;
    }
    if (!instruction || assistantLoading || assistantActivity) return;

    assistantIntentSuggestionRequestRef.current += 1;
    assistantIntentSuggestionHistoryRef.current = [];
    setAssistantHasSubmitted(true);
    setAssistantIntentSuggestions([]);
    setAssistantIntentSuggestionsLoading(false);

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const requestDraft = draftRef.current;
    const assistantMessageId = crypto.randomUUID();
    const request = {
      instruction,
      referenceImages: currentAssistantReferences().map(({ name, mimeType, dataBase64 }) => ({
        name,
        mimeType,
        dataBase64
      })),
      currentFields: requestDraft.fields
        .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
        .filter((field) => field.label),
      templateScenario: requestDraft.extractionScenario,
      ...(templateIntent ? { templateIntent } : {}),
      clarificationRounds: assistantClarificationRoundsRef.current,
      conversation: assistantMessages
        .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
        .slice(-16)
        .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
      assistantSurface: "scene-template",
      memoryQuery: boardId ? { boardId } : undefined,
      workflowMode: requestDraft.mode,
      useCase: requestDraft.useCase
    } satisfies Omit<CollaborateSceneRequest, "providerId">;
    setAssistantInteraction(null);
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: displayContent },
      { id: assistantMessageId, role: "assistant", content: "", streaming: true }
    ]);
    setAssistantPrompt("");
    setAssistantLoading(true);

    try {
      assistantStreamRef.current = startSceneCollaborationStream(request, {
        onDelta: (delta) => {
          if (requestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((message) => (
            message.id === assistantMessageId ? { ...message, content: message.content + delta } : message
          )));
        },
        onResult: (result) => {
          if (requestVersionRef.current === requestVersion) {
            receiveAssistantResult(result, requestDraft, assistantMessageId);
          }
        },
        onActivity: setAssistantActivity,
        onInteraction: (interactionId, interaction) => {
          if (requestVersionRef.current !== requestVersion || !interaction) return;
          setAssistantActivity(null);
          setAssistantInteraction({
            state: { id: interactionId, interaction },
            agentInteractionId: interactionId
          });
        },
        onError: (message) => {
          if (requestVersionRef.current !== requestVersion) return;
          setAssistantMessages((current) => current.map((item) => (
            item.id === assistantMessageId
              ? { ...item, content: item.content.trim() || message, streaming: false, tone: "error" }
              : item
          )));
          setAssistantLoading(false);
          assistantStreamRef.current = null;
        },
        onCancelled: () => {
          setAssistantLoading(false);
          assistantStreamRef.current = null;
        }
      });
    } catch (error) {
      void onCollaborate(request)
        .then((result) => receiveAssistantResult(result, requestDraft, assistantMessageId))
        .catch((fallbackError) => {
          const message = fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
              ? error.message
              : "AI 助手暂时不可用。";
          setAssistantMessages((current) => current.map((item) => (
            item.id === assistantMessageId
              ? { ...item, content: message, streaming: false, tone: "error" }
              : item
          )));
          setAssistantLoading(false);
      });
    }
  }

  function fillWithAssistant(): void {
    const instruction = resolveSceneAssistantInstruction(
      assistantPrompt,
      currentAssistantReferences().length
    );
    sendTemplateAssistantInstruction(instruction);
  }

  function selectAssistantIntentSuggestion(suggestion: string): void {
    sendTemplateAssistantInstruction(suggestion);
  }

  function sendTemplateAssistantInstruction(instruction: string): void {
    const route = routeTemplateAssistantIntent(instruction, currentAssistantReferences().length);
    if (route?.useExampleRecommendation) {
      void recommendExampleBrief();
      return;
    }
    sendAssistantInstruction(instruction, instruction, route?.intent);
  }

  function submitAssistantInteraction(values: AiAssistantInteractionValues): void {
    const pending = assistantInteraction;
    if (!pending) return;
    if (pending.agentInteractionId) {
      assistantStreamRef.current?.respondToInteraction(pending.agentInteractionId, "submit", values);
      setAssistantInteraction(null);
      setAssistantActivity("正在继续…");
      return;
    }
    if (pending.state.interaction.type === "form") {
      const answers = formatAssistantInteractionAnswers(pending.state.interaction, values);
      sendAssistantInstruction(answers);
      return;
    }

    setAssistantInteraction(null);
    setAssistantActivity("正在更新模板内容…");
    assistantApplyTimerRef.current = window.setTimeout(() => {
      if (pending.result && pending.requestDraft && pending.messageId) {
        applyAssistantResult(pending.result, pending.requestDraft, pending.messageId);
      }
    }, 420);
  }

  function dismissAssistantInteraction(): void {
    if (!assistantInteraction) return;
    if (assistantInteraction.agentInteractionId) {
      assistantStreamRef.current?.respondToInteraction(
        assistantInteraction.agentInteractionId,
        "dismiss"
      );
      setAssistantInteraction(null);
      setAssistantActivity("正在继续…");
      return;
    }
    const content = assistantInteraction.state.interaction.type === "confirm"
      ? "先不生成，我想继续完善。"
      : "先不补充这些信息。";
    setAssistantInteraction(null);
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content }
    ]);
  }

  function stopAssistant(): void {
    requestVersionRef.current += 1;
    assistantStreamRef.current?.dispose();
    assistantStreamRef.current = null;
    setAssistantLoading(false);
    setAssistantActivity(null);
    setAssistantMessages((current) => current.map((message) => (
      message.streaming ? { ...message, streaming: false } : message
    )));
  }

  function buildSceneInput(): NewSceneInput | null {
    if (!draft.name.trim()) {
      toast.error("请填写模板名称。");
      return null;
    }
    const fields = compactSceneFields(draft.fields);
    const prompt = serializeSceneFields(fields);
    if (!prompt) {
      toast.error("至少填写 1 个提示词字段。");
      return null;
    }

    return {
      name: draft.name,
      description: draft.description,
      prompt,
      fields,
      category: draft.category,
      mode: draft.mode,
      useCase: draft.useCase,
      extractionScenario: draft.extractionScenario,
      conversation: normalizeSceneConversation(
        assistantMessages.filter((message) => !message.streaming)
      )
    };
  }

  function persistScene(): SceneDefinition | null {
    const input = buildSceneInput();
    if (!input) return null;
    const scene = persistedScene ? onUpdate(persistedScene, input) : onSave(input);
    setPersistedScene(scene);
    clearSceneCreatorDraft();
    return scene;
  }

  function saveScene(): void {
    const scene = persistScene();
    if (!scene) return;
    onCreated(scene);
  }

  async function recommendExampleBrief(): Promise<void> {
    if (!canCollaborate) {
      toast.error("请先配置支持文本能力的 Provider。");
      onOpenSettings();
      return;
    }
    if (assistantLoading || assistantActivity || recommendingExample || reviewingExample) return;

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const requestDraft = draftRef.current;
    const previousBrief = exampleBrief;
    const assistantMessageId = crypto.randomUUID();
    assistantIntentSuggestionRequestRef.current += 1;
    setAssistantHasSubmitted(true);
    setAssistantIntentSuggestions([]);
    setAssistantInteraction(null);
    setRecommendingExample(true);
    setAssistantLoading(true);
    setAssistantMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: "推荐一条示例需求来验证模板" },
      { id: assistantMessageId, role: "assistant", content: "正在结合模板和参考图挑选验证样例…", streaming: true }
    ]);

    try {
      const result = await onCollaborate({
        instruction: buildTemplateExampleRecommendationInstruction(requestDraft.extractionScenario),
        referenceImages: currentAssistantReferences().map(({ name, mimeType, dataBase64 }, index) => ({
          name: `助手上下文图 ${index + 1} · ${name}`,
          mimeType,
          dataBase64
        })),
        currentFields: requestDraft.fields
          .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
          .filter((field) => field.label)
          .slice(0, 16),
        templateScenario: requestDraft.extractionScenario,
        templateIntent: "validate",
        clarificationRounds: 1,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-12)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        recordInHistory: false,
        assistantSurface: "scene-template",
        memoryQuery: boardId ? { boardId } : undefined,
        workflowMode: requestDraft.mode,
        useCase: requestDraft.useCase
      });
      if (requestVersionRef.current !== requestVersion) return;
      const recommendation = extractTemplateExampleRecommendation(result);
      if (!recommendation) throw new Error("助手没有返回可用的示例需求。");
      setExampleBrief(recommendation);
      setAssistantMessages((current) => current.map((message) => (
        message.id === assistantMessageId
          ? {
              ...message,
              content: `${result.message}\n\n**已填入示例需求**\n${recommendation}`,
              streaming: false,
              receipt: {
                label: "已填入示例需求",
                actions: [{
                  label: "撤销",
                  kind: "undo" as const,
                  onAction: () => setExampleBrief(previousBrief)
                }]
              }
            }
          : message
      )));
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      const message = getWorkbenchErrorMessage(error, "暂时无法推荐示例需求。");
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? { ...item, content: message, streaming: false, tone: "error" }
          : item
      )));
      toast.error(message);
    } finally {
      if (requestVersionRef.current === requestVersion) setAssistantLoading(false);
      setRecommendingExample(false);
    }
  }

  function buildExampleReviewReferences(dataUrls: string[]): {
    references: SceneAssistantReference[];
    originalCount: number;
    generatedCount: number;
  } {
    const originalReferences: SceneAssistantReference[] = [
      ...(exampleSourceImage ? [{
        name: `原始参考图 1 · ${exampleSourceImage.payload.name}`,
        mimeType: exampleSourceImage.payload.mimeType,
        dataBase64: exampleSourceImage.payload.dataBase64
      }] : []),
      ...assistantReferencesRef.current.map(({ name, mimeType, dataBase64 }, index) => ({
        name: `原始参考图 ${index + (exampleSourceImage ? 2 : 1)} · ${name}`,
        mimeType,
        dataBase64
      }))
    ];
    const generatedReferences = dataUrls
      .map((dataUrl, index) => sceneReferenceFromDataUrl(dataUrl, `生成示例 ${index + 1}`))
      .filter((reference): reference is SceneAssistantReference => reference !== null);

    if (originalReferences.length === 0) {
      const selectedGenerated = generatedReferences.slice(0, SCENE_CREATOR_MAX_REFERENCE_COUNT);
      return { references: selectedGenerated, originalCount: 0, generatedCount: selectedGenerated.length };
    }
    const originalLimit = Math.min(
      originalReferences.length,
      Math.max(1, SCENE_CREATOR_MAX_REFERENCE_COUNT - generatedReferences.length)
    );
    const selectedOriginal = originalReferences.slice(0, originalLimit);
    const selectedGenerated = generatedReferences.slice(
      0,
      SCENE_CREATOR_MAX_REFERENCE_COUNT - selectedOriginal.length
    );
    return {
      references: [...selectedOriginal, ...selectedGenerated],
      originalCount: selectedOriginal.length,
      generatedCount: selectedGenerated.length
    };
  }

  async function reviewGeneratedExample(
    images: Array<{ path: string; dataUrl: string }>,
    prompt: string,
    brief: string,
    sceneId: string
  ): Promise<void> {
    if (!canCollaborate) return;

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const requestDraft = draftRef.current;
    const assistantMessageId = crypto.randomUUID();
    assistantIntentSuggestionRequestRef.current += 1;
    setAssistantHasSubmitted(true);
    setAssistantIntentSuggestions([]);
    setAssistantInteraction(null);
    setReviewingExample(true);
    setAssistantLoading(true);
    setAssistantMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: exampleSourceImage || assistantReferencesRef.current.length > 0
          ? "示例已生成，正在对照原始参考图复盘模板…"
          : "示例已生成，正在检查结果与模板目标的偏差…",
        streaming: true
      }
    ]);

    try {
      const api = getImageWorkbenchApi();
      const reviewDataUrls = await Promise.all(images.map((image) => (
        image.dataUrl.startsWith("data:") ? image.dataUrl : api.readAssetDataUrl(image.path)
      )));
      const reviewReferences = buildExampleReviewReferences(reviewDataUrls);
      if (reviewReferences.generatedCount === 0) {
        throw new Error("生成结果无法转换为助手可读取的图片。");
      }
      const result = await onCollaborate({
        instruction: buildTemplateExampleReviewInstruction({
          originalReferenceCount: reviewReferences.originalCount,
          generatedExampleCount: reviewReferences.generatedCount,
          scenario: requestDraft.extractionScenario
        }),
        referenceImages: reviewReferences.references,
        currentFields: [
          ...requestDraft.fields
            .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
            .filter((field) => field.label)
            .slice(0, 14),
          { label: "本次示例需求", value: brief },
          { label: "本次实际生成提示词", value: prompt }
        ],
        templateScenario: requestDraft.extractionScenario,
        clarificationRounds: 1,
        conversation: assistantMessages
          .filter((message) => !message.streaming && message.tone !== "error" && message.content.trim())
          .slice(-12)
          .map(({ role, content, assistantContext }) => ({ role, content: assistantContext ?? content })),
        recordInHistory: false,
        assistantSurface: "scene-template",
        memoryQuery: {
          ...(boardId ? { boardId } : {}),
          sceneId
        },
        workflowMode: requestDraft.mode,
        useCase: requestDraft.useCase
      });
      if (requestVersionRef.current !== requestVersion) return;
      if (result.fields.length === 0) throw new Error("助手完成了示例复盘，但没有返回可应用的模板建议。");
      receiveAssistantResult({
        ...result,
        interaction: {
          type: "confirm",
          title: "应用这版模板优化？",
          description: "确认后会用复盘建议更新模板字段，生成示例会继续保留。",
          confirmLabel: "应用优化",
          cancelLabel: "保留当前模板"
        }
      }, requestDraft, assistantMessageId, {
        messageContent: "示例复盘已完成。请先查看复核发现和调整原因，再决定是否应用。",
        assistantContext: result.message,
        confirmationPreview: buildTemplateExampleReviewConfirmationPreview(result, {
          name: requestDraft.name,
          description: requestDraft.description,
          fields: requestDraft.fields
        })
      });
    } catch (error) {
      if (requestVersionRef.current !== requestVersion) return;
      const message = getWorkbenchErrorMessage(error, "示例已生成，但自动复盘暂时失败。");
      setAssistantMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? { ...item, content: message, streaming: false, tone: "error" }
          : item
      )));
      setAssistantLoading(false);
      toast.warning(message);
    } finally {
      setReviewingExample(false);
    }
  }

  async function selectExampleSourceImage(file?: File): Promise<void> {
    if (!file) return;
    if (!SUPPORTED_ASSISTANT_REFERENCE_TYPES.has(file.type)) {
      toast.error("仅支持 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_ASSISTANT_REFERENCE_BYTES) {
      toast.error("源图不能超过 20 MB。");
      return;
    }
    try {
      const previewUrl = await readFileAsDataUrl(file);
      setExampleSourceImage({
        previewUrl,
        payload: {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type,
          dataBase64: previewUrl.slice(previewUrl.indexOf(",") + 1),
          role: "edit-target"
        }
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取源图。");
    }
  }

  function pasteExampleSourceImage(event: ClipboardEvent<HTMLElement>): void {
    const file = extractClipboardImageFiles(event.clipboardData)[0];
    if (!file) return;
    event.preventDefault();
    void selectExampleSourceImage(file);
  }

  async function generateExample(): Promise<void> {
    const brief = exampleBrief.trim();
    if (!brief || exampleGenerationActive || reviewingExample || assistantLoading) return;
    if (!canOptimize) {
      toast.error("请先配置支持文本能力的 Provider。");
      onOpenSettings();
      return;
    }
    if (!hasImageWorkbenchApi() || !generationDefaults.canGenerate) {
      toast.error("请先完成图片 Provider 配置。");
      onOpenSettings();
      return;
    }
    if (draft.mode === "edit" && !generationDefaults.supportsEditing) {
      toast.error("当前图片 Provider 不支持编辑模板。");
      onOpenSettings();
      return;
    }
    if (draft.mode === "edit" && !exampleSourceImage) {
      toast.error("编辑模板需要先上传一张源图。");
      return;
    }

    const scene = persistScene();
    if (!scene) return;
    const activeGeneration = startActiveSceneGeneration({
      sceneId: scene.id,
      source: "creator",
      requestedCount: exampleCount
    });
    setGeneratingExample(true);
    let delayedNoticeId: string | number | undefined;
    const delayedNoticeTimer = window.setTimeout(() => {
      delayedNoticeId = iterlayToast.generationPending();
    }, GENERATION_ESTIMATE_MS);
    try {
      const prompt = (await onOptimize(scene, brief, scene.prompt)).trim();
      if (!prompt) throw new Error("模型没有返回可用的示例提示词。");
      if (/【[^】]+】/.test(prompt)) {
        throw new Error("示例提示词仍有未填写的占位符，请补充更具体的示例描述。");
      }
      setExamplePrompt(prompt);
      const result = await getImageWorkbenchApi().generateImage({
        workflowMode: scene.mode,
        useCase: scene.useCase,
        sceneId: scene.id,
        sceneOnly: true,
        prompt,
        model: generationDefaults.model,
        size: exampleSize,
        n: exampleCount,
        quality: exampleQuality,
        style: generationDefaults.style,
        providerId: generationDefaults.providerId,
        referenceImages: exampleSourceImage ? [exampleSourceImage.payload] : []
      });
      setExampleImages(result.images.map((image) => image.dataUrl));
      await onMediaChange();
      finishActiveSceneGeneration(scene.id, activeGeneration.id);
      window.clearTimeout(delayedNoticeTimer);
      if (delayedNoticeId !== undefined) iterlayToast.dismiss(delayedNoticeId);
      iterlayToast.result({
        count: result.images.length,
        title: `已生成 ${result.images.length} 张示例`,
        detail: "示例已保存到当前模板",
        previews: result.images.map((image) => image.dataUrl)
      });
      result.warnings?.forEach((warning) => toast.warning(warning));
      setGeneratingExample(false);
      await reviewGeneratedExample(
        result.images,
        prompt,
        brief,
        scene.id
      );
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "示例生成失败。"));
    } finally {
      window.clearTimeout(delayedNoticeTimer);
      if (delayedNoticeId !== undefined) iterlayToast.dismiss(delayedNoticeId);
      finishActiveSceneGeneration(scene.id, activeGeneration.id);
      setGeneratingExample(false);
    }
  }

  const saveActionLabel = persistedScene
    ? persistedScene.source === "preset" ? "保存为我的模板" : "保存修改"
    : "创建模板";
  const canGenerateExample = Boolean(
    canSave &&
    canOptimize &&
    generationDefaults.canGenerate &&
    (draft.mode !== "edit" || (generationDefaults.supportsEditing && exampleSourceImage))
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <input
        ref={assistantReferenceInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          void addAssistantReferences(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 [-webkit-app-region:drag]">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 [-webkit-app-region:no-drag]"
          aria-label="返回模版库"
          title="返回模版库"
          onClick={onCancel}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">模版库</span>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <span className="truncate text-sm font-semibold">{initialScene ? "编辑模板" : "新建模板"}</span>

        <div className="ml-auto flex items-center gap-2 [-webkit-app-region:no-drag]">
          <span className="hidden text-xs text-muted-foreground md:inline">
            {persistedScene && persistedScene !== initialScene ? "已保存，可继续生成示例" : "草稿自动保存"}
          </span>
          <Button size="sm" className="gap-1.5" disabled={!canSave} onClick={saveScene}>
            <Check className="h-3.5 w-3.5" />
            {saveActionLabel}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <section className="border-b border-border pb-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-lg font-semibold text-balance">模板信息</h1>
              </div>
              <div
                role="group"
                aria-label="工作流类型"
                className="flex h-9 w-fit items-center rounded-md bg-muted p-0.5"
              >
                {WORKFLOW_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.mode === value}
                    disabled={assistantLoading}
                    onClick={() => changeWorkflowMode(value)}
                    className={cn(
                      "relative isolate flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                      draft.mode === value
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {draft.mode === value ? (
                      <SegmentedControlIndicator
                        layoutId={`${indicatorId}-scene-creator-workflow-indicator`}
                        className="rounded bg-background shadow-sm"
                      />
                    ) : null}
                    <Icon className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium">模板名称</span>
                <Input
                  autoFocus
                  value={draft.name}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  placeholder="例如：极简产品主图"
                  className="h-10"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium">分类</span>
                <Select
                  value={draft.category}
                  onValueChange={(value) => updateDraft({ category: value as SceneDraft["category"] })}
                >
                  <SelectTrigger className="h-10">{SCENE_CATEGORY_LABELS[draft.category]}</SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium">
                  简短说明 <span className="font-normal text-muted-foreground">可选</span>
                </span>
                <Input
                  value={draft.description}
                  onChange={(event) => updateDraft({ description: event.target.value })}
                  placeholder="例如：适合留白充足的电商首图"
                  className="h-10"
                />
              </label>
            </div>
          </section>

          <section className="pt-7">
            <div className="flex flex-wrap items-start gap-3">
              <div>
                <h2 className="text-sm font-semibold">提示词字段</h2>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  已填写 {completion.filled} / {completion.total}
                </p>
              </div>
            </div>

            <div className="mt-5 border-y border-border bg-card">
              {draft.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="group/field flex items-start gap-2 border-b border-border px-1 py-2.5 last:border-b-0 focus-within:bg-muted/35 sm:px-2"
                >
                  <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
                    <Input
                      value={field.label}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                      aria-label={`第 ${index + 1} 个字段名称`}
                      className="h-9 border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground hover:border-input focus-visible:bg-background focus-visible:text-foreground"
                    />
                    <textarea
                      rows={1}
                      value={field.value}
                      onChange={(event) => updateField(field.id, { value: event.target.value })}
                      onFocus={(event) => {
                        if (/^【[^】]+】$/.test(field.value.trim())) {
                          const input = event.currentTarget;
                          window.requestAnimationFrame(() => input.select());
                        }
                      }}
                      aria-label={`${field.label || `第 ${index + 1} 个字段`}内容`}
                      placeholder={`填写${field.label || "字段内容"}`}
                      className="min-h-9 w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-2 text-sm leading-5 outline-none [field-sizing:content] placeholder:text-muted-foreground hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/field:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
                    aria-label={`删除${field.label || `第 ${index + 1} 个字段`}`}
                    title="删除字段"
                    onClick={() => removeField(field.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="ghost" size="sm" className="mt-3 gap-1.5" onClick={addField}>
              <Plus className="h-3.5 w-3.5" />
              添加字段
            </Button>
          </section>

          <section className="mt-7 border-t border-border pt-7">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">生成示例</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  输入一条真实需求，直接生成效果图来验证这套模板。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canCollaborate || completion.filled === 0 || assistantLoading || exampleGenerationActive}
                  onClick={() => void recommendExampleBrief()}
                >
                  {recommendingExample
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <WandSparkles className="h-3.5 w-3.5" />}
                  {recommendingExample ? "正在推荐" : "助手推荐"}
                </Button>
                {!canOptimize || !generationDefaults.canGenerate ? (
                  <Button variant="ghost" size="sm" onClick={onOpenSettings}>配置 Provider</Button>
                ) : null}
              </div>
            </div>

            <Textarea
              value={exampleBrief}
              onChange={(event) => setExampleBrief(event.target.value)}
              onKeyDown={(event) => {
                if (!isSendEnter(event)) return;
                event.preventDefault();
                void generateExample();
              }}
              placeholder="例如：一款夏季防晒霜，小红书首发，突出轻薄不黏腻"
              className="mt-4 min-h-24 resize-y text-sm leading-6 placeholder:text-muted-foreground"
            />

            {draft.mode === "edit" ? (
              <div className="mt-4">
                <p className="text-xs font-medium">编辑源图</p>
                {exampleSourceImage ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={exampleSourceImage.previewUrl}
                      alt="示例编辑源图"
                      className="h-16 w-16 rounded-md border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{exampleSourceImage.payload.name}</p>
                      <button
                        type="button"
                        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setExampleSourceImage(null)}
                      >
                        移除源图
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    className="mt-2 flex h-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-muted/20 transition-colors hover:border-foreground/35 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring"
                    onPaste={pasteExampleSourceImage}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(event) => {
                        void selectExampleSourceImage(event.currentTarget.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Upload className="h-4 w-4" />
                      上传或直接粘贴源图
                    </span>
                  </label>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <select
                aria-label="示例尺寸"
                value={exampleSize}
                onChange={(event) => setExampleSize(event.target.value)}
                disabled={exampleGenerationActive || reviewingExample}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {!EXAMPLE_SIZE_OPTIONS.some((option) => option.value === exampleSize) ? (
                  <option value={exampleSize}>{exampleSize}</option>
                ) : null}
                {EXAMPLE_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                aria-label="示例质量"
                value={exampleQuality}
                onChange={(event) => setExampleQuality(event.target.value as ImageQuality)}
                disabled={exampleGenerationActive || reviewingExample}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              >
                {EXAMPLE_QUALITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="flex h-9 items-center rounded-md bg-muted p-0.5" role="group" aria-label="示例张数">
                {([1, 2, 3] as GenerationCount[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={exampleCount === value}
                    disabled={exampleGenerationActive || reviewingExample}
                    onClick={() => setExampleCount(value)}
                    className={cn(
                      "relative isolate h-8 min-w-10 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                      exampleCount === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {exampleCount === value ? (
                      <SegmentedControlIndicator
                        layoutId={`${indicatorId}-scene-creator-example-count-indicator`}
                        className="rounded bg-background shadow-sm"
                      />
                    ) : null}
                    <span className="relative z-10">{value} 张</span>
                  </button>
                ))}
              </div>
              <Button
                className="ml-auto gap-1.5"
                disabled={
                  !exampleBrief.trim() ||
                  !canGenerateExample ||
                  exampleGenerationActive ||
                  reviewingExample ||
                  assistantLoading
                }
                onClick={() => void generateExample()}
              >
                {exampleGenerationActive || reviewingExample
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <WandSparkles className="h-4 w-4" />}
                {reviewingExample
                  ? "正在复盘"
                  : exampleGenerationActive && exampleGenerationTiming
                    ? exampleGenerationTiming.overdue
                      ? `仍在生成 ${exampleGenerationTiming.elapsedLabel}`
                      : `预计剩余 ${exampleGenerationTiming.remainingLabel}`
                    : exampleGenerationActive ? "正在生成" : "生成示例"}
              </Button>
            </div>

            {exampleGenerationActive && exampleGenerationTiming ? (
              <div
                data-scene-creator-generation-status
                role="status"
                aria-live="polite"
                className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              >
                <Loader2
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 animate-spin [animation-duration:1.4s] motion-reduce:animate-none"
                />
                <span>
                  已用 <time className="tabular-nums">{exampleGenerationTiming.elapsedLabel}</time>
                  <span aria-hidden> · </span>
                  {exampleGenerationTiming.overdue ? (
                    "比预计久一点，任务仍在处理中"
                  ) : (
                    <>预计剩余 <time className="tabular-nums">{exampleGenerationTiming.remainingLabel}</time></>
                  )}
                </span>
              </div>
            ) : null}

            {exampleImages.length > 0 ? (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">本次结果</p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {reviewingExample ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {reviewingExample ? "助手正在对照参考图" : "已保存到模板"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {exampleImages.map((src, index) => {
                    const alt = `模板示例 ${index + 1}`;
                    return (
                      <button
                        key={`${src}:${index}`}
                        type="button"
                        aria-label={`放大预览${alt}`}
                        className="group relative aspect-square min-w-0 overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          const image = event.currentTarget.querySelector("img");
                          setExampleImageLightbox({
                            src,
                            alt: `${alt}放大预览`,
                            sourceRect: {
                              left: rect.left,
                              top: rect.top,
                              width: rect.width,
                              height: rect.height
                            },
                            imageWidth: image?.naturalWidth || undefined,
                            imageHeight: image?.naturalHeight || undefined
                          });
                        }}
                      >
                        <img
                          src={src}
                          alt={alt}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transition-none"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-150 group-hover:bg-black/30 group-hover:opacity-100 group-focus-visible:bg-black/30 group-focus-visible:opacity-100 motion-reduce:transition-none">
                          <Maximize2 className="h-4 w-4 drop-shadow" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {examplePrompt ? (
              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">查看本次提示词</summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/80">{examplePrompt}</p>
              </details>
            ) : null}
          </section>

          {persistedScene?.source === "custom" ? (
            <section className="mt-7 border-t border-border pt-5">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除模板
              </Button>
            </section>
          ) : null}
        </div>
      </main>
        <motion.div
          key="scene-creator-assistant"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="h-[min(420px,48dvh)] w-full shrink-0 lg:h-auto lg:w-[400px]"
        >
          <Suspense fallback={<div className="h-full border-l border-border bg-card max-lg:border-l-0 max-lg:border-t" aria-busy="true" />}>
            <AiAssistant
                variant="docked"
                title="模板共创助手"
                subtitle={draft.extractionScenario
                  ? getTemplateExtractionScenarioTemplateLabel(draft.extractionScenario)
                  : "基于当前模板"}
                messages={assistantMessages}
                value={assistantPrompt}
                placeholder={assistantReferenceCount > 0
                  ? "描述希望借鉴的内容，也可直接发送图片…"
                  : "继续描述，或粘贴参考图…"}
                streaming={assistantLoading}
                activityLabel={assistantActivity ?? undefined}
                interaction={assistantInteraction?.state}
                disabled={Boolean(assistantActivity)}
                canSubmitWithoutText={assistantReferenceCount > 0}
                contextImages={assistantContextImages}
                headerActions={(
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-[#686865] hover:bg-[#e8e8e4] hover:text-[#242422] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
                    aria-label={`选择提供给 AI 助手的模板示例，已选 ${assistantExampleReferences.length} 张`}
                    onClick={() => setAssistantExamplesOpen(true)}
                  >
                    <GalleryHorizontalEnd className="h-3.5 w-3.5" />
                    示例
                    {assistantExampleReferences.length > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#30302e] px-1 text-[10px] font-semibold leading-none text-white dark:bg-primary dark:text-primary-foreground">
                        {assistantExampleReferences.length}
                      </span>
                    ) : null}
                  </Button>
                )}
                intentSuggestionsEnabled={!assistantLoading && !assistantInteraction}
                intentSuggestionCount={TEMPLATE_INTENT_SUGGESTION_COUNT}
                intentSuggestions={assistantIntentSuggestions}
                intentSuggestionsLoading={assistantIntentSuggestionsLoading}
                className="max-lg:border-l-0 max-lg:border-t"
                onValueChange={setAssistantPrompt}
                onSubmit={fillWithAssistant}
                onStop={stopAssistant}
                onAttach={() => assistantReferenceInputRef.current?.click()}
                onPasteImages={(files) => void addAssistantReferences(files)}
                onIntentSuggestionSelect={selectAssistantIntentSuggestion}
                onRefreshIntentSuggestions={assistantHasSubmitted
                  ? () => void requestAssistantIntentSuggestions("divergent")
                  : undefined}
                onInteractionSubmit={submitAssistantInteraction}
                onInteractionDismiss={dismissAssistantInteraction}
            />
          </Suspense>
        </motion.div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除“{persistedScene?.name ?? draft.name}”？</DialogTitle>
            <DialogDescription>模板及其示例会被删除，此操作无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              disabled={deletingTemplate}
              onClick={() => {
                if (!persistedScene) return;
                void (async () => {
                  setDeletingTemplate(true);
                  try {
                    if (hasImageWorkbenchApi()) await getImageWorkbenchApi().deleteSceneMedia(persistedScene.id);
                    onDelete(persistedScene.id);
                    setDeleteOpen(false);
                    onCancel();
                  } catch (error) {
                    toast.error(getWorkbenchErrorMessage(error, "删除模板媒体失败。"));
                  } finally {
                    setDeletingTemplate(false);
                  }
                })();
              }}
            >
              {deletingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除模板
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assistantExamplesOpen} onOpenChange={setAssistantExamplesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择提供给 AI 的示例</DialogTitle>
            <DialogDescription>
              AI 只会查看你在这里选择的示例。选择状态不会改变模板中的示例。
            </DialogDescription>
          </DialogHeader>
          {availableAssistantExamples.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>已生成 {availableAssistantExamples.length} 张</span>
                <span className="tabular-nums">
                  已选 {assistantExampleReferences.length} / {SCENE_CREATOR_MAX_REFERENCE_COUNT}
                </span>
              </div>
              <div className="grid max-h-[min(56vh,520px)] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {availableAssistantExamples.map((result, index) => {
                  const selected = selectedAssistantExampleIds.has(result.id);
                  const loading = loadingAssistantExampleIds.has(result.id);
                  const alt = `模板示例 ${index + 1}`;
                  return (
                    <div
                      key={result.id}
                      className={cn(
                        "group/example relative aspect-square min-w-0 overflow-hidden rounded-md border bg-muted transition-colors",
                        selected ? "border-foreground ring-1 ring-foreground" : "border-border"
                      )}
                    >
                      <img src={result.imageUrl} alt={alt} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        aria-label={`${selected ? "取消选择" : "选择"}${alt}提供给 AI 助手`}
                        aria-pressed={selected}
                        disabled={loading}
                        onClick={() => void toggleAssistantExample(result, index)}
                      >
                        <span
                          className={cn(
                            "absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-white shadow-sm",
                            selected
                              ? "border-foreground bg-foreground"
                              : "border-white/80 bg-black/45 group-hover/example:bg-black/65"
                          )}
                        >
                          {loading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : selected ? <Check className="h-3 w-3" /> : null}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute bottom-2 right-2 h-8 w-8 bg-background/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-background group-hover/example:opacity-100 focus-visible:opacity-100"
                        aria-label={`放大预览${alt}`}
                        onClick={(event) => {
                          const container = event.currentTarget.parentElement;
                          const image = container?.querySelector("img");
                          const rect = container?.getBoundingClientRect();
                          if (!rect) return;
                          setExampleImageLightbox({
                            src: result.imageUrl,
                            alt: `${alt}放大预览`,
                            sourceRect: {
                              left: rect.left,
                              top: rect.top,
                              width: rect.width,
                              height: rect.height
                            },
                            imageWidth: image?.naturalWidth || undefined,
                            imageHeight: image?.naturalHeight || undefined
                          });
                        }}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center">
              <GalleryHorizontalEnd className="h-7 w-7 text-muted-foreground/70" />
              <p className="mt-3 text-sm font-medium">还没有生成示例</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                在左侧生成示例后，就可以选择提供给 AI 助手。
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setAssistantExamplesOpen(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {exampleImageLightbox ? (
          <ImageZoomLightbox
            src={exampleImageLightbox.src}
            alt={exampleImageLightbox.alt}
            sourceRect={exampleImageLightbox.sourceRect}
            imageWidth={exampleImageLightbox.imageWidth}
            imageHeight={exampleImageLightbox.imageHeight}
            onClose={() => setExampleImageLightbox(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
