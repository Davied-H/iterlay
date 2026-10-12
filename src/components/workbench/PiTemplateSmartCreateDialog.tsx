import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Bot, Image as ImageIcon, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CollaborateSceneRequest,
  CollaborateSceneResult,
  GptImageUseCase,
  ImageWorkflowMode,
  SceneAssistantReference
} from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { extractClipboardImageFiles } from "@/lib/clipboard-images";
import {
  applySceneFieldSuggestion,
  buildSceneFieldSuggestions,
  compactSceneFields,
  createSceneDraft,
  isDefaultEmptySceneFields,
  SCENE_CREATOR_MAX_REFERENCE_COUNT,
  type SceneDraft
} from "@/lib/scene-creator";
import {
  serializeSceneFields,
  type NewSceneInput,
  type SceneDefinition
} from "@/lib/scene-library";
import type { SceneGenerationDefaults } from "@/lib/scene-media";
import type { GenerateTemplateVerification } from "@/lib/template-verification";
import { canContinuePiTemplateAgentTask, startPiTemplateAgent, updatePiTemplateAgent } from "@/lib/pi-template-agent";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

const SUPPORTED_REFERENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

interface SmartCreateReference extends SceneAssistantReference {
  id: string;
  previewUrl: string;
  fingerprint: string;
}

interface PiTemplateSmartCreateDialogProps {
  open: boolean;
  boardId?: string;
  currentPrompt: string;
  initialWorkflowMode: ImageWorkflowMode;
  initialUseCase: GptImageUseCase;
  generationDefaults: SceneGenerationDefaults;
  onGenerateVerification?: GenerateTemplateVerification;
  canOptimize: boolean;
  canCollaborate: boolean;
  onOpenChange: (open: boolean) => void;
  onCollaborate: (input: Omit<CollaborateSceneRequest, "providerId">) => Promise<CollaborateSceneResult>;
  onOptimize: (scene: SceneDefinition, prompt: string, templatePrompt?: string) => Promise<string>;
  onSave: (input: NewSceneInput) => SceneDefinition;
  onUpdate: (scene: SceneDefinition, input: NewSceneInput) => SceneDefinition;
  onMediaChange: () => Promise<void>;
  onOpenSettings: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取参考图。"));
    reader.readAsDataURL(file);
  });
}

function sceneReferenceFromDataUrl(dataUrl: string, name: string): SceneAssistantReference | null {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) return null;
  return { name, mimeType: match[1], dataBase64: match[2] };
}

function applyAgentResult(base: SceneDraft, result: CollaborateSceneResult): SceneDraft {
  const fields = buildSceneFieldSuggestions(base.fields, result.fields).reduce(
    (current, suggestion) => applySceneFieldSuggestion(current, suggestion),
    base.fields
  );
  return {
    ...base,
    name: base.name.trim() || result.suggestedName?.trim() || "智能模板",
    description: base.description.trim()
      || result.suggestedDescription?.trim()
      || "由模板智能创建器根据需求和参考图自动沉淀",
    fields,
    revision: base.revision + 1
  };
}

function inputFromAgentDraft(value: SceneDraft): NewSceneInput | null {
  const fields = compactSceneFields(value.fields);
  const prompt = serializeSceneFields(fields);
  return prompt ? {
    name: value.name.trim() || "智能模板",
    description: value.description.trim(),
    prompt,
    fields,
    category: value.category,
    mode: value.mode,
    useCase: value.useCase,
    extractionScenario: value.extractionScenario,
    conversation: []
  } : null;
}

export function PiTemplateSmartCreateDialog({
  open,
  boardId,
  currentPrompt,
  initialWorkflowMode,
  initialUseCase,
  generationDefaults,
  onGenerateVerification,
  canOptimize,
  canCollaborate,
  onOpenChange,
  onCollaborate,
  onOptimize,
  onSave,
  onUpdate,
  onMediaChange,
  onOpenSettings
}: PiTemplateSmartCreateDialogProps): React.ReactElement {
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<SmartCreateReference[]>([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(open);
  const referenceCount = references.length;

  useEffect(() => {
    const isNewSession = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!isNewSession) return;

    setReferences([]);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  }, [open]);

  async function addReferences(files: File[]): Promise<void> {
    const available = SCENE_CREATOR_MAX_REFERENCE_COUNT - references.length;
    if (available <= 0) {
      toast(`最多添加 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张参考图。`);
      return;
    }

    const existing = new Set(references.map((reference) => reference.fingerprint));
    const candidates = files.filter((file) => {
      if (!SUPPORTED_REFERENCE_TYPES.has(file.type)) {
        toast.error(`“${file.name}”格式不受支持，请使用 PNG、JPEG、WebP 或 GIF。`);
        return false;
      }
      if (file.size > MAX_REFERENCE_BYTES) {
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
      const added = await Promise.all(candidates.map(async (file): Promise<SmartCreateReference> => {
        const previewUrl = await readFileAsDataUrl(file);
        return {
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type,
          dataBase64: previewUrl.slice(previewUrl.indexOf(",") + 1),
          previewUrl,
          fingerprint: `${file.name}:${file.size}:${file.lastModified}`
        };
      }));
      setReferences((current) => [...current, ...added].slice(0, SCENE_CREATOR_MAX_REFERENCE_COUNT));
      if (files.length > available) {
        toast(`已添加 ${added.length} 张，最多支持 ${SCENE_CREATOR_MAX_REFERENCE_COUNT} 张参考图。`);
      }
    } catch (error) {
      toast.error(getWorkbenchErrorMessage(error, "无法读取参考图。"));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    const files = extractClipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void addReferences(files);
  }

  async function runAgent(): Promise<void> {
    const requestBrief = brief.trim();
    const requestReferences = references.map(({ name, mimeType, dataBase64 }) => ({
      name,
      mimeType,
      dataBase64
    }));
    if (!requestBrief && requestReferences.length === 0) return;
    if (!canCollaborate || !canOptimize || !generationDefaults.canGenerate || !hasImageWorkbenchApi()) {
      toast.error("模板智能创建器需要同时配置文本和图片 Provider。");
      onOpenChange(false);
      onOpenSettings();
      return;
    }

    if (!onGenerateVerification) {
      toast.error("模板验证稿生成入口未就绪，请重新打开应用后重试。");
      return;
    }
    const task = startPiTemplateAgent("正在理解需求并提取参考图中的风格规则。你可以继续浏览模板库或切换到画板。");
    // The task already owns a snapshot of the request, so immediately reset this transient form.
    setBrief("");
    setReferences([]);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
    onOpenChange(false);
    try {
      const initialDraft = createSceneDraft(currentPrompt, initialWorkflowMode, initialUseCase);
      const baseDraft = isDefaultEmptySceneFields(initialDraft.fields, initialDraft.mode)
        ? { ...initialDraft, fields: [], revision: initialDraft.revision + 1 }
        : initialDraft;
      const extraction = await onCollaborate({
        instruction: requestBrief
          ? `你是模板智能创建器。请根据以下需求${requestReferences.length ? "和参考图" : ""}自动创建可复用模板：${requestBrief}\n\n提取风格、布局、组件和不可变约束，直接整理为完整的可编辑字段。`
          : "你是模板智能创建器。请仅根据随请求提供的参考图，提取可复用的视觉风格、布局、组件和不可变约束，直接整理为完整的可编辑字段。",
        referenceImages: requestReferences,
        currentFields: baseDraft.fields
          .map(({ label, value }) => ({ label: label.trim(), value: value.trim() }))
          .filter((field) => field.label && field.value),
        templateScenario: baseDraft.extractionScenario,
        templateIntent: "extract",
        recordInHistory: false,
        assistantSurface: "scene-template",
        memoryQuery: boardId ? { boardId } : undefined,
        workflowMode: baseDraft.mode,
        useCase: baseDraft.useCase
      });
      if (!canContinuePiTemplateAgentTask(task.id)) return;

      let workingDraft = applyAgentResult(baseDraft, extraction);
      const firstInput = inputFromAgentDraft(workingDraft);
      if (!firstInput) throw new Error("模板智能创建器没有返回可用的模板规则。");
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      let scene = onSave(firstInput);

      updatePiTemplateAgent(task.id, {
        phase: "generate",
        attempt: 1,
        templateName: scene.name,
        detail: "模板已创建，正在生成验证稿。你可以继续浏览画板或其他页面。"
      });
      const prompt = (await onOptimize(
        scene,
        requestBrief || "根据参考图生成一张用于验证模板规则的示例图。",
        scene.prompt
      )).trim();
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      if (!prompt || /【[^】]+】/u.test(prompt)) {
        throw new Error("模板智能创建器无法生成完整的验证提示词。");
      }
      updatePiTemplateAgent(task.id, {
        detail: "模板已保存，正在准备验证稿费用确认；确认后才会提交图片生成。"
      });
      const generated = await onGenerateVerification({
        boardId,
        workflowMode: scene.mode,
        useCase: scene.useCase,
        sceneId: scene.id,
        sceneOnly: true,
        prompt,
        model: generationDefaults.model,
        size: generationDefaults.size,
        n: 1,
        quality: generationDefaults.quality ?? "auto",
        style: generationDefaults.style,
        providerId: generationDefaults.providerId,
        referenceImages: []
      }, {
        id: task.id,
        templateName: scene.name,
        canContinue: () => canContinuePiTemplateAgentTask(task.id)
      });
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      if (!generated) {
        updatePiTemplateAgent(task.id, {
          phase: "complete",
          detail: "模板已保存；验证稿费用未确认，未提交图片生成，也未进行视觉复核。"
        });
        return;
      }
      await onMediaChange();
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      updatePiTemplateAgent(task.id, {
        phase: "review",
        attempt: 1,
        detail: "模板智能创建器正在把验证稿与需求、参考图逐项对照。"
      });
      const generatedReferences = await Promise.all(generated.images.slice(0, 2).map(async (image, index) => {
        const dataUrl = image.dataUrl.startsWith("data:")
          ? image.dataUrl
          : await getImageWorkbenchApi().readAssetDataUrl(image.path);
        return sceneReferenceFromDataUrl(dataUrl, `智能创建验证稿 ${index + 1}`);
      }));
      const review = await onCollaborate({
          instruction: `你是模板智能创建器的质量门。对照${requestBrief ? "用户需求、" : ""}参考图和生成验证稿复核模板。${requestBrief ? `需求：${requestBrief}\n\n` : ""}若已满足，请在开头明确写“结论：通过”；否则给出可直接应用的字段修订。`,
          referenceImages: [
            ...requestReferences,
            ...generatedReferences.filter((item): item is SceneAssistantReference => item !== null)
          ].slice(0, SCENE_CREATOR_MAX_REFERENCE_COUNT),
          currentFields: [
            ...workingDraft.fields
              .filter((field) => field.label && field.value)
              .map(({ label, value }) => ({ label, value })),
            { label: "验证需求", value: requestBrief },
            { label: "验证提示词", value: prompt }
          ],
          templateScenario: workingDraft.extractionScenario,
          templateIntent: "audit",
          recordInHistory: false,
          assistantSurface: "scene-template",
          memoryQuery: { ...(boardId ? { boardId } : {}), sceneId: scene.id },
          workflowMode: scene.mode,
          useCase: scene.useCase
      });
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      const passed = /结论\s*[:：]\s*(?:通过|满意|合格)/u.test(review.message);
      if (!passed && review.fields.length > 0) {
        workingDraft = applyAgentResult(workingDraft, review);
        const refinedInput = inputFromAgentDraft(workingDraft);
        if (refinedInput) scene = onUpdate(scene, refinedInput);
      }
      updatePiTemplateAgent(task.id, {
        phase: "complete",
        attempt: 1,
        templateName: scene.name,
        detail: passed
          ? "模板智能创建器已确认模板通过复核，验证稿已保存在模板中。"
          : "验证稿已生成，并已根据复核结论保存模板；不会自动重复生成。"
      });
      toast.success(`模板智能创建器已保存模板「${scene.name}」`);
    } catch (error) {
      if (!canContinuePiTemplateAgentTask(task.id)) return;
      const message = getWorkbenchErrorMessage(error, "模板智能创建失败。");
      updatePiTemplateAgent(task.id, {
        phase: "error",
        title: "模板智能创建需要处理",
        detail: message
      });
      toast.error(message);
    }
  }

  return (
    <>
      <input
        ref={referenceInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          void addReferences(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-[640px]" onPaste={handlePaste}>
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              模板智能创建
            </DialogTitle>
            <DialogDescription>描述目标或提供参考图，系统会在后台提取模板、生成验证稿并复核。</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">目标需求</span>
              <Textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="例如：为一组精品咖啡新品海报建立可复用模板，保留杂志式留白和深红色标题系统。"
                className="min-h-32 resize-y bg-background text-sm leading-6"
              />
            </label>

            <section className="border-t border-border pt-4" aria-labelledby="smart-create-references-title">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id="smart-create-references-title" className="text-sm font-semibold">参考图</h3>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {referenceCount} / {SCENE_CREATOR_MAX_REFERENCE_COUNT}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    仅支持 PNG、JPEG、WebP、GIF；可上传或直接粘贴截图，仅提供图片也可开始。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={referenceCount >= SCENE_CREATOR_MAX_REFERENCE_COUNT}
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  上传图片
                </Button>
              </div>

              {references.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label="已上传参考图">
                  {references.map((reference) => (
                    <div key={reference.id} className="group/reference relative h-20 w-20 shrink-0" role="listitem">
                      <img
                        src={reference.previewUrl}
                        alt={reference.name}
                        className="h-full w-full rounded-md border border-border bg-muted object-cover"
                      />
                      <button
                        type="button"
                        className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                        aria-label={`移除参考图 ${reference.name}`}
                        onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-3 flex min-h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4" />
                  上传参考图
                </button>
              )}
            </section>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={!brief.trim() && referenceCount === 0}
              onClick={() => void runAgent()}
            >
              <WandSparkles className="h-3.5 w-3.5" />
              创建并后台运行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
