import { useUiText } from "@/i18n";
import { useEffect, useId, useRef, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  CopyPlus,
  EyeOff,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X
} from "lucide-react";
import type { GptImageUseCase, ImageWorkflowMode } from "@shared/types";
import { Button } from "@/components/ui/button";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { parseSceneFields, type NewSceneInput, type SceneCategory, type SceneDefinition } from "@/lib/scene-library";
import {
  buildTemplatePromptFromExtractionItems,
  findTemplateDetailWarnings,
  type TemplateExtractionCategory,
  type TemplateExtractionItem,
  type TemplateExtractionResult,
  type TemplateExtractionScenario
} from "@/lib/template-workflow";
import { cn } from "@/lib/utils";

export interface TemplateExtractionSource {
  id: string;
  imageUrl: string;
  imagePath: string;
  sourcePrompt: string;
  workflowMode: ImageWorkflowMode;
  useCase: GptImageUseCase;
  category?: SceneCategory;
}

export type TemplateExtractionSaveDecision =
  | { action: "create" }
  | { action: "replace"; template: SceneDefinition };

interface TemplateExtractionDialogProps {
  open: boolean;
  source: TemplateExtractionSource | null;
  existingTemplates?: SceneDefinition[];
  onOpenChange: (open: boolean) => void;
  onExtract: (
    source: TemplateExtractionSource,
    workflowMode: ImageWorkflowMode,
    scenario: TemplateExtractionScenario,
    onItems: (items: TemplateExtractionItem[]) => void
  ) => Promise<TemplateExtractionResult>;
  onSave: (
    source: TemplateExtractionSource,
    input: NewSceneInput,
    decision: TemplateExtractionSaveDecision
  ) => Promise<void>;
}

const EXTRACTION_SCENARIOS: Array<{ value: TemplateExtractionScenario; label: string; title: string }> = [
  { value: "design-language", label: "设计语言", title: "跨页面复用颜色、字体、组件、图形与光效规则" },
  { value: "layout-skeleton", label: "布局骨架", title: "复用区域比例、对齐、阅读顺序和信息层级" },
  { value: "series-template", label: "系列模板", title: "同时复用设计语言与布局骨架，只替换业务内容" },
  { value: "replica", label: "高度还原", title: "保留模块组合、数量和相对位置，替换实例内容" }
];

const EXTRACTION_CATEGORIES: Array<{
  value: TemplateExtractionCategory;
  label: string;
  emptyLabel: string;
  icon: typeof ShieldCheck;
}> = [
  { value: "retained", label: "保留", emptyLabel: "没有需要固定保留的规则", icon: ShieldCheck },
  { value: "variable", label: "可变", emptyLabel: "没有识别到可替换内容", icon: Braces },
  { value: "ignored", label: "忽略", emptyLabel: "没有识别到需要排除的细节", icon: EyeOff }
];

const EXTRACTION_PROGRESS_STEPS = [
  "识别画面结构与视觉特征",
  "区分可复用规则与可变内容",
  "整理为可编辑的模板规则"
];

export function TemplateExtractionDialog({
  open,
  source,
  existingTemplates = [],
  onOpenChange,
  onExtract,
  onSave
}: TemplateExtractionDialogProps): React.ReactElement {
  const uiText = useUiText();

  const indicatorId = useId();
  const [draft, setDraft] = useState<NewSceneInput | null>(null);
  const [items, setItems] = useState<TemplateExtractionItem[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workflowMode, setWorkflowMode] = useState<ImageWorkflowMode>(source?.workflowMode ?? "generate");
  const [scenario, setScenario] = useState<TemplateExtractionScenario>("series-template");
  const [selectedCategory, setSelectedCategory] = useState<TemplateExtractionCategory>("retained");
  const [editingItem, setEditingItem] = useState<{ id: string; label: string; value: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionStartedAt, setExtractionStartedAt] = useState<number | null>(null);
  const [extractionElapsedSeconds, setExtractionElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState<{
    template: SceneDefinition;
    input: NewSceneInput;
  } | null>(null);
  const extractionRequestRef = useRef(0);
  const visibleItems = items.filter((item) => item.category === selectedCategory);
  const detailWarnings = findTemplateDetailWarnings(items, prompt);

  useEffect(() => () => {
    extractionRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (!extracting || extractionStartedAt === null) return;
    const updateElapsed = (): void => setExtractionElapsedSeconds(
      Math.floor((Date.now() - extractionStartedAt) / 1000)
    );
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [extracting, extractionStartedAt]);

  useEffect(() => {
    if (open && source && !draft && !extracting && !error) extractTemplate(source.workflowMode, scenario);
    // Opening this dialog is the start of the extraction workflow. Subsequent requests are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  function extractTemplate(
    mode = workflowMode,
    nextScenario = scenario
  ): void {
    if (!open || !source) return;
    const requestId = ++extractionRequestRef.current;
    setDraft(null);
    setItems([]);
    setName("");
    setDescription("");
    setPrompt("");
    setSelectedCategory("retained");
    setEditingItem(null);
    setAdvancedOpen(false);
    setSaveConflict(null);
    setError(null);
    setExtractionStartedAt(Date.now());
    setExtractionElapsedSeconds(0);
    setExtracting(true);
    void onExtract(source, mode, nextScenario, (nextItems) => {
      if (extractionRequestRef.current !== requestId) return;
      setItems(nextItems);
      if (!nextItems.some((item) => item.category === "retained")) {
        setSelectedCategory(nextItems.some((item) => item.category === "variable") ? "variable" : "ignored");
      }
    }).then((next) => {
      if (extractionRequestRef.current !== requestId) return;
      setDraft(next.input);
      setItems(next.items);
      setName(next.input.name);
      setDescription(next.input.description);
      setPrompt(next.input.prompt);
      if (!next.items.some((item) => item.category === "retained")) {
        setSelectedCategory(next.items.some((item) => item.category === "variable") ? "variable" : "ignored");
      }
    }).catch((cause) => {
      if (extractionRequestRef.current === requestId) {
        setError(getWorkbenchErrorMessage(cause, "暂时无法从这张图提取模板。"));
      }
    }).finally(() => {
      if (extractionRequestRef.current === requestId) {
        setExtracting(false);
        setExtractionStartedAt(null);
      }
    });
  }

  function changeWorkflowMode(mode: ImageWorkflowMode): void {
    if (mode === workflowMode) return;
    setWorkflowMode(mode);
    if (draft || extracting || error) extractTemplate(mode, scenario);
  }

  function changeScenario(nextScenario: TemplateExtractionScenario): void {
    if (nextScenario === scenario) return;
    setScenario(nextScenario);
    if (draft || extracting || error) extractTemplate(workflowMode, nextScenario);
  }

  function changeItemCategory(id: string, category: TemplateExtractionCategory): void {
    const nextItems = items.map((item) => item.id === id ? { ...item, category } : item);
    setItems(nextItems);
    setPrompt(buildTemplatePromptFromExtractionItems(nextItems));
  }

  function saveItemEdit(): void {
    if (!editingItem || !editingItem.label.trim() || !editingItem.value.trim()) return;
    const nextItems = items.map((item) => item.id === editingItem.id
      ? { ...item, label: editingItem.label.trim(), value: editingItem.value.trim() }
      : item);
    setItems(nextItems);
    setPrompt(buildTemplatePromptFromExtractionItems(nextItems));
    setEditingItem(null);
  }

  function currentInput(): NewSceneInput | null {
    if (!source || !draft || !name.trim() || !prompt.trim() || saving) return null;
    return {
      ...draft,
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      fields: parseSceneFields(prompt)
    };
  }

  function requestSave(): void {
    const input = currentInput();
    if (!input) return;
    const normalizedName = input.name.toLocaleLowerCase();
    const conflict = existingTemplates.find((template) => (
      template.source === "custom" && template.name.trim().toLocaleLowerCase() === normalizedName
    ));
    if (conflict) {
      setSaveConflict({ template: conflict, input });
      return;
    }
    void saveTemplate(input, { action: "create" });
  }

  async function saveTemplate(
    input: NewSceneInput,
    decision: TemplateExtractionSaveDecision
  ): Promise<void> {
    if (!source || saving) return;
    setSaving(true);
    setSaveConflict(null);
    setError(null);
    try {
      await onSave(source, input, decision);
      onOpenChange(false);
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, "模板保存失败，请稍后重试。"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[min(760px,calc(100dvh-24px))] w-[min(900px,calc(100vw-24px))] max-w-none flex-col overflow-hidden rounded-lg p-0 sm:w-[min(900px,calc(100vw-40px))]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-14">
          <DialogTitle>{uiText("沉淀为模板")}</DialogTitle>
          <DialogDescription>{uiText("从当前画板提取可复用的设计规则。")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
            <aside className="md:sticky md:top-0">
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                {source ? (
                  <img
                    src={source.imageUrl}
                    alt={uiText("用于提取模板的画板图片")}
                    className="aspect-video w-full object-cover md:aspect-square"
                  />
                ) : null}
              </div>
            </aside>

            <div className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{uiText("模板用途")}</p>
                  <div
                    role="group"
                    aria-label={uiText("模板用途")}
                    className="flex h-9 shrink-0 items-center rounded-md bg-muted p-0.5"
                  >
                    {([
                      { value: "generate" as const, label: "创建图片", icon: ImagePlus },
                      { value: "edit" as const, label: "编辑图片", icon: Pencil }
                    ]).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={workflowMode === value}
                        disabled={saving}
                        onClick={() => changeWorkflowMode(value)}
                        className={cn(
                          "relative isolate flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                          workflowMode === value
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {workflowMode === value ? (
                          <SegmentedControlIndicator
                            layoutId={`${indicatorId}-template-extraction-workflow-indicator`}
                            className="rounded bg-background shadow-sm"
                          />
                        ) : null}
                        <Icon className="relative z-10 h-3.5 w-3.5" />
                        <span className="relative z-10">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block min-w-[168px] space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{uiText("提取范围")}</span>
                  <Select value={scenario} onValueChange={(value) => changeScenario(value as TemplateExtractionScenario)} disabled={saving}>
                    <SelectTrigger className="h-9 text-xs" aria-label={uiText("提取范围")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTRACTION_SCENARIOS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {extracting ? (
                <div className="mx-auto flex min-h-64 w-full max-w-md flex-col justify-center py-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin text-foreground motion-reduce:animate-none" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{uiText("正在提炼模板规则")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {extractionElapsedSeconds >= 20 ? uiText("任务仍在处理中，请保持此窗口打开") : uiText("正在分析当前画板，通常需要十几秒")}
                      </p>
                    </div>
                    <time className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {extractionElapsedSeconds} {uiText("秒")}</time>
                  </div>

                  <div
                    className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={uiText("模板规则提炼进度")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(88, 16 + extractionElapsedSeconds * 4)}
                    aria-valuetext={`已处理 ${extractionElapsedSeconds} 秒`}
                  >
                    <div
                      className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: `${Math.min(88, 16 + extractionElapsedSeconds * 4)}%` }}
                    />
                  </div>

                  <ol className="mt-5 space-y-3" aria-label={uiText("提炼步骤")}>
                    {EXTRACTION_PROGRESS_STEPS.map((step, index) => {
                      const activeStep = Math.min(2, Math.floor(extractionElapsedSeconds / 5));
                      const complete = index < activeStep;
                      const active = index === activeStep;
                      return (
                        <li key={step} className={cn("flex items-center gap-2.5 text-xs", active ? "text-foreground" : "text-muted-foreground")}>
                          <span className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                            complete && "border-foreground bg-foreground text-background",
                            active && "border-foreground",
                            !complete && !active && "border-border"
                          )}>
                            {complete ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                          </span>
                          <span>{step}</span>
                          {active ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label={uiText("正在处理")} /> : null}
                        </li>
                      );
                    })}
                  </ol>

                  {items.length > 0 ? (
                    <section className="mt-5 overflow-hidden rounded-md border border-border bg-background" aria-live="polite">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <h3 className="text-xs font-medium">{uiText("已解析的规则")}</h3>
                        <span className="text-xs tabular-nums text-muted-foreground">{items.length} {uiText("条")}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {items.map((item) => (
                          <div key={item.id} className="px-3 py-2.5">
                            <p className="text-xs font-medium">{item.label}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : error && !draft ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <p className="max-w-sm text-sm font-medium">{uiText("提取失败")}</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{error}</p>
                </div>
              ) : draft ? (
                <div className="space-y-5 pt-5">
                  <section>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{uiText("模板规则")}</h3>
                      <span className="text-xs text-muted-foreground">{items.length} {uiText("条")}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-muted p-1" role="tablist" aria-label={uiText("模板提取结果分类")}>
                      {EXTRACTION_CATEGORIES.map(({ value, label, icon: Icon }) => {
                        const count = items.filter((item) => item.category === value).length;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={selectedCategory === value}
                            onClick={() => setSelectedCategory(value)}
                            className={cn(
                              "relative isolate flex h-9 min-w-0 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selectedCategory === value
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {selectedCategory === value ? (
                              <SegmentedControlIndicator
                                layoutId={`${indicatorId}-template-extraction-category-indicator`}
                                className="rounded bg-background shadow-sm"
                              />
                            ) : null}
                            <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                            <span className="relative z-10 truncate">{label}</span>
                            <span className="relative z-10 tabular-nums text-muted-foreground">{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
                      {visibleItems.length > 0 ? visibleItems.map((item) => {
                        const isEditing = editingItem?.id === item.id;
                        return (
                        <div key={item.id} className="grid gap-2 border-b border-border px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_96px] sm:items-center">
                          <div className="min-w-0">
                            {isEditing ? (
                              <div className="space-y-2">
                                <Input
                                  value={editingItem.label}
                                  onChange={(event) => setEditingItem((current) => current ? { ...current, label: event.target.value } : current)}
                                  className="h-8 text-xs"
                                  aria-label={uiText("规则名称")}
                                  autoFocus
                                />
                                <Textarea
                                  value={editingItem.value}
                                  onChange={(event) => setEditingItem((current) => current ? { ...current, value: event.target.value } : current)}
                                  className="min-h-20 resize-y text-xs leading-5"
                                  aria-label={uiText("规则内容")}
                                />
                              </div>
                            ) : (
                              <>
                                <p className="truncate text-xs font-medium">{item.label}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.value}</p>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  title={uiText("保存规则修改")}
                                  aria-label={uiText("保存规则修改")}
                                  disabled={!editingItem.label.trim() || !editingItem.value.trim()}
                                  onClick={saveItemEdit}
                                  className="flex h-8 w-8 items-center justify-center rounded text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title={uiText("取消规则修改")}
                                  aria-label={uiText("取消规则修改")}
                                  onClick={() => setEditingItem(null)}
                                  className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                title={uiText("编辑规则")}
                                aria-label={uiText("编辑{{ui:0}}", [item.label])}
                                onClick={() => setEditingItem({ id: item.id, label: item.label, value: item.value })}
                                className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <Select
                            value={item.category}
                            onValueChange={(value) => changeItemCategory(item.id, value as TemplateExtractionCategory)}
                          >
                            <SelectTrigger className="h-8 px-2 text-xs" aria-label={uiText("调整{{ui:0}}的分类", [item.label])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EXTRACTION_CATEGORIES.map((category) => (
                                <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                      }) : (
                        <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                          {EXTRACTION_CATEGORIES.find((category) => category.value === selectedCategory)?.emptyLabel}
                        </p>
                      )}
                    </div>
                  </section>

                  {detailWarnings.length > 0 ? (
                    <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>{uiText("发现 ")}{detailWarnings.length} {uiText("项可能仍含原图细节：")}{detailWarnings.join("、")}{uiText("。建议改为可变或忽略。")}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{uiText("模板名称")}</span>
                      <Input value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{uiText("适用场景")}</span>
                      <Input value={description} onChange={(event) => setDescription(event.target.value)} />
                    </label>
                  </div>

                  <section>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center justify-between text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={advancedOpen}
                      onClick={() => setAdvancedOpen((current) => !current)}
                    >
                      {uiText("编辑完整提示词")}<ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
                    </button>
                    {advancedOpen ? (
                      <Textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        className="mt-2 min-h-40 resize-y text-xs leading-6"
                        aria-label={uiText("编辑模板完整提示词")}
                      />
                    ) : null}
                  </section>
                </div>
              ) : null}
            </div>
          </div>

          {error && draft ? (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>{uiText("取消")}</Button>
          <Button
            type="button"
            disabled={extracting || saving || (draft ? !name.trim() || !prompt.trim() : !source)}
            onClick={() => draft ? requestSave() : extractTemplate()}
          >
            {saving || extracting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
            {saving
              ? uiText("正在保存")
              : extracting
                ? uiText("正在提炼")
                : draft
                  ? uiText("保存模板")
                  : error
                    ? uiText("重新提炼")
                    : uiText("提炼模板")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog
        open={Boolean(saveConflict)}
        onOpenChange={(next) => !next && !saving && setSaveConflict(null)}
      >
        <DialogContent className="w-[calc(100vw-32px)] max-w-md" hideClose={saving}>
          <DialogHeader>
            <DialogTitle>{uiText("已存在同名模板")}</DialogTitle>
            <DialogDescription>
              “{saveConflict?.template.name}{uiText("”已经存在。保留原模板并创建新的，或用本次结果覆盖它。")}</DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border border-y border-border text-sm">
            <div className="py-3">
              <p className="font-medium">{uiText("创建新的")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("保留现有模板，并新增一份同名模板。")}</p>
            </div>
            <div className="py-3">
              <p className="font-medium">{uiText("覆盖同名模板")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{uiText("更新现有模板的规则、用途和示例图。")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setSaveConflict(null)}>
              {uiText("取消")}</Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || !saveConflict}
              onClick={() => {
                if (saveConflict) void saveTemplate(saveConflict.input, {
                  action: "replace",
                  template: saveConflict.template
                });
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {uiText("覆盖同名模板")}</Button>
            <Button
              type="button"
              autoFocus
              disabled={saving || !saveConflict}
              onClick={() => {
                if (saveConflict) void saveTemplate(saveConflict.input, { action: "create" });
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <CopyPlus className="h-4 w-4" />}
              {uiText("创建新的")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default TemplateExtractionDialog;
