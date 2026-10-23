import { AssistantPermissionsSettings } from "./AssistantPermissionsSettings";
import { PiAgentLogPanel } from "@/components/workbench/PiAgentLogPanel";
import { useUiText } from "@/i18n";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import type {
  AssistantSkillSummary,
  PiAgentBuiltinToolName,
  PiAgentResourceDetail,
  PiAgentResourceEntry,
  PiAgentResourceInventory
} from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

import { SettingsGroup, SettingsPageHeader, SettingsRow } from "./SettingsPrimitives";
import "./pi-agent-settings.css";

type PiAgentPanelTab = "permissions" | "overview" | "tools" | "assistant-skills" | "skills" | "extensions" | "logs";

interface PiAgentCatalogItem {
  id: string;
  kind: "builtin-tool" | "iterlay-tool" | "assistant-skill" | "skill" | "extension";
  name: string;
  description: string;
  enabled: boolean;
  badge?: string;
  source?: PiAgentResourceEntry["source"];
  path?: string;
  resource?: PiAgentResourceEntry;
  assistantSkill?: AssistantSkillSummary;
}

export function PiAgentSettingsPanel({
  available,
  enabled,
  model,
  inventory,
  resourceError,
  assistantSkills,
  builtinTools,
  iterlayTools,
  skillPaths,
  extensionPaths,
  customSkillPaths,
  customExtensionPaths,
  maxTurns,
  webSearchMaxResults,
  onEnabledChange,
  onConfigureModel,
  onBuiltinToolsChange,
  onIterlayToolsChange,
  onSkillPathsChange,
  onExtensionPathsChange,
  onCustomSkillPathsChange,
  onCustomExtensionPathsChange,
  onMaxTurnsChange,
  onWebSearchMaxResultsChange,
  onRefresh,
  onEditAssistantSkill,
  navigation,
  initialTab
}: {
  initialTab?: "permissions";
  navigation?: ReactNode;
  available: boolean;
  enabled: boolean;
  model?: string;
  inventory: PiAgentResourceInventory | null;
  resourceError: string | null;
  assistantSkills: AssistantSkillSummary[];
  builtinTools: PiAgentBuiltinToolName[];
  iterlayTools: string[];
  skillPaths: string[];
  extensionPaths: string[];
  customSkillPaths: string[];
  customExtensionPaths: string[];
  maxTurns: number;
  webSearchMaxResults: number;
  onEnabledChange: (value: boolean) => void;
  onConfigureModel?: () => void;
  onBuiltinToolsChange: (value: PiAgentBuiltinToolName[]) => void;
  onIterlayToolsChange: (value: string[]) => void;
  onSkillPathsChange: (value: string[]) => void;
  onExtensionPathsChange: (value: string[]) => void;
  onCustomSkillPathsChange: (value: string[]) => void;
  onCustomExtensionPathsChange: (value: string[]) => void;
  onMaxTurnsChange: (value: number) => void;
  onWebSearchMaxResultsChange: (value: number) => void;
  onRefresh: () => void;
  onEditAssistantSkill: (id: string) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const modeId = useId();

  const [tab, setTab] = useState<PiAgentPanelTab>(initialTab ?? "overview");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | PiAgentResourceEntry["source"]>("all");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resourceDetail, setResourceDetail] = useState<PiAgentResourceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [customSkillPath, setCustomSkillPath] = useState("");
  const [customExtensionPath, setCustomExtensionPath] = useState("");
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const pageSize = 8;

  const toggle = (items: string[], value: string, next: boolean): string[] => next
    ? Array.from(new Set([...items, value]))
    : items.filter((item) => item !== value);

  const catalog = useMemo<PiAgentCatalogItem[]>(() => {
    if (!inventory) return [];
    if (tab === "tools") {
      return [
        ...inventory.builtinTools.map((tool): PiAgentCatalogItem => ({
          id: `builtin:${tool.name}`,
          kind: "builtin-tool",
          name: tool.name,
          description: tool.description,
          enabled: builtinTools.includes(tool.name),
          badge: tool.risk === "read" ? "只读" : tool.risk === "write" ? "写入" : "执行"
        })),
        ...inventory.iterlayTools.map((tool): PiAgentCatalogItem => ({
          id: `iterlay:${tool.name}`,
          kind: "iterlay-tool",
          name: tool.name,
          description: tool.description,
          enabled: iterlayTools.includes(tool.name),
          badge: "Iterlay"
        }))
      ];
    }
    if (tab === "assistant-skills") {
      return assistantSkills.map((skill): PiAgentCatalogItem => ({
        id: `assistant:${skill.id}`,
        kind: "assistant-skill",
        name: skill.id,
        description: skill.description,
        enabled: true,
        badge: skill.hasOverride ? "用户版本" : "内置",
        path: skill.activePath,
        assistantSkill: skill
      }));
    }
    const resources = tab === "skills"
      ? inventory.skills
      : tab === "extensions"
        ? inventory.extensions
        : [];
    const enabledPaths = tab === "skills" ? skillPaths : extensionPaths;
    return resources.map((resource): PiAgentCatalogItem => ({
      id: `${resource.kind}:${resource.path}`,
      kind: resource.kind,
      name: resource.name,
      description: resource.description,
      enabled: enabledPaths.includes(resource.path),
      badge: resource.kind === "extension" ? "可执行" : sourceLabel(resource.source),
      source: resource.source,
      path: resource.path,
      resource
    }));
  }, [assistantSkills, builtinTools, extensionPaths, inventory, iterlayTools, skillPaths, tab]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return catalog.filter((item) => {
      if (status === "enabled" && !item.enabled) return false;
      if (status === "disabled" && item.enabled) return false;
      if (source !== "all" && item.source !== source) return false;
      if (!normalizedQuery) return true;
      return `${item.name}\n${item.description}\n${item.path ?? ""}\n${item.source ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [catalog, query, source, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedItem = catalog.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
    setResourceDetail(null);
    setDetailError(null);
  }, [query, source, status, tab]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (!selectedItem?.resource?.path) {
      setResourceDetail(null);
      setDetailError(null);
      return;
    }
    let disposed = false;
    setDetailLoading(true);
    setDetailError(null);
    void getImageWorkbenchApi().getPiAgentResourceDetail(selectedItem.resource.path)
      .then((detail) => {
        if (!disposed) setResourceDetail(detail);
      })
      .catch((error) => {
        if (!disposed) setDetailError(getWorkbenchErrorMessage(error, "无法读取资源详情。"));
      })
      .finally(() => {
        if (!disposed) setDetailLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedItem?.resource?.path]);

  function toggleItem(item: PiAgentCatalogItem, next: boolean): void {
    if (item.kind === "builtin-tool") {
      onBuiltinToolsChange(toggle(builtinTools, item.name, next) as PiAgentBuiltinToolName[]);
    } else if (item.kind === "iterlay-tool") {
      onIterlayToolsChange(toggle(iterlayTools, item.name, next));
    } else if (item.kind === "skill" && item.path) {
      onSkillPathsChange(toggle(skillPaths, item.path, next));
    } else if (item.kind === "extension" && item.path) {
      onExtensionPathsChange(toggle(extensionPaths, item.path, next));
    }
  }

  function applyToolPreset(preset: "readonly" | "creative" | "all"): void {
    if (!inventory) return;
    if (preset === "readonly") {
      onBuiltinToolsChange(["read", "grep", "find", "ls"]);
      onIterlayToolsChange(inventory.iterlayTools
        .map((tool) => tool.name)
        .filter((name) => /^(?:list|get|open|fit|focus)/u.test(name)));
      return;
    }
    onBuiltinToolsChange(preset === "all"
      ? inventory.builtinTools.map((tool) => tool.name)
      : ["read", "grep", "find", "ls"]);
    onIterlayToolsChange(inventory.iterlayTools.map((tool) => tool.name));
  }

  function addCustomPath(kind: "skill" | "extension"): void {
    const value = (kind === "skill" ? customSkillPath : customExtensionPath).trim();
    if (!value) return;
    if (kind === "skill") {
      onCustomSkillPathsChange(toggle(customSkillPaths, value, true));
      onSkillPathsChange(toggle(skillPaths, value, true));
      setCustomSkillPath("");
    } else {
      onCustomExtensionPathsChange(toggle(customExtensionPaths, value, true));
      onExtensionPathsChange(toggle(extensionPaths, value, true));
      setCustomExtensionPath("");
    }
    onRefresh();
  }

  const enabledSkillCount = inventory?.skills.filter((item) => skillPaths.includes(item.path)).length ?? 0;
  const enabledExtensionCount = inventory?.extensions.filter((item) => extensionPaths.includes(item.path)).length ?? 0;

  return (
    <div className="pi-agent-settings">
      <SettingsPageHeader
        title={uiText("助手能力")}
        description={uiText("让助手不只提供建议，还能按你的要求查找素材、生成图片和整理画板。")}
        actions={<>
          <Button type="button" size="sm" variant="outline" title={uiText("刷新列表")} onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />{uiText("刷新列表")}
          </Button>
        </>}
      />
      {navigation}
      <section className="pi-agent-mode" aria-labelledby={`${modeId}-title`}>
        <div className="pi-agent-mode-row">
          <div className="pi-agent-mode-copy">
            <label id={`${modeId}-title`} htmlFor={modeId}>{uiText("允许助手执行操作")}</label>
            <p id={`${modeId}-description`}>{uiText("关闭时只进行对话；开启后，助手可以使用你允许的操作完成任务。")}</p>
          </div>
          <span className="pi-agent-mode-status">{uiText(!available ? "待配置" : enabled ? "已开启" : "仅对话")}</span>
          <Switch id={modeId} checked={enabled} disabled={!available} onCheckedChange={onEnabledChange}
            aria-labelledby={`${modeId}-title`} aria-describedby={`${modeId}-description ${modeId}-readiness`} />
        </div>
        <div id={`${modeId}-readiness`} className="pi-agent-mode-readiness" role="status">
          <span>{!available ? uiText("对话模型尚未就绪，请先完成模型连接设置。")
            : enabled ? uiText("已允许的操作会按需使用，生成和重要修改仍需确认。")
            : uiText("操作清单会保留，开启后才会使用。")}</span>
          {!available && onConfigureModel ? <Button type="button" variant="outline" size="sm" onClick={onConfigureModel}>{uiText("配置对话模型")}</Button> : null}
        </div>
      </section>
      {resourceError ? <p className="border-b border-border/70 px-6 py-2 text-xs text-destructive">{resourceError}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="pi-resource-tabs" aria-label={uiText("助手能力分类")}>
          {([
            ["overview", "使用说明", ""],
            ["permissions", "权限", ""],
            ["tools", "可执行操作", inventory ? String(inventory.builtinTools.length + inventory.iterlayTools.length) : "—"],
            ["assistant-skills", "创作指南", String(assistantSkills.length)],
            ["skills", "自定义指南", inventory ? String(inventory.skills.length) : "—"],
            ["extensions", "高级扩展", inventory ? String(inventory.extensions.length) : "—"],
            ["logs", "执行记录", ""]
          ] as Array<[PiAgentPanelTab, string, string]>).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
            >
              <span>{uiText(label)}</span>
              {count ? <span className="text-[10px] tabular-nums opacity-65">{count}</span> : null}
            </button>
          ))}
        </nav>

        {tab !== "overview" && tab !== "permissions" ? <p className="pi-resource-intro">{uiText(tab === "tools"
          ? "选择助手可以执行的操作，关闭的操作不会被调用。"
          : tab === "assistant-skills" ? "内置的创作指南，为不同任务提供合适的提示词和工作步骤。"
          : tab === "skills" ? "加载你自己的操作指南（Skill）。一般使用无需修改。"
          : tab === "extensions" ? "添加额外的本地功能。一般使用无需安装扩展。"
          : "查看助手实际执行的操作和处理结果。")}</p> : null}
        <div className="pi-resource-grid">
        {tab === "permissions" ? <AssistantPermissionsSettings /> : tab === "logs" ? <div className="col-span-full overflow-y-auto p-6"><PiAgentLogPanel /></div> : tab === "overview" ? (
          <PiAgentOverview
            available={available}
            enabled={enabled}
            model={model}
            toolCount={builtinTools.length + iterlayTools.length}
            skillCount={enabledSkillCount}
            extensionCount={enabledExtensionCount}
            maxTurns={maxTurns}
            webSearchMaxResults={webSearchMaxResults}
            onMaxTurnsChange={onMaxTurnsChange}
            onWebSearchMaxResultsChange={onWebSearchMaxResultsChange}
          />
        ) : (
          <>
            <section className="pi-resource-list">
              <div className="pi-resource-toolbar">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={uiText("搜索{{ui:0}}…", [tab === "tools" ? "工具" : tab === "extensions" ? "扩展" : "Skill"])}
                    className="h-9 pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CompactFilter
                    value={status}
                    options={[
                      { value: "all", label: uiText("全部") },
                      { value: "enabled", label: uiText("已启用") },
                      { value: "disabled", label: uiText("未启用") }
                    ]}
                    onChange={(value) => setStatus(value as typeof status)}
                  />
                  {(tab === "skills" || tab === "extensions") ? (
                    <CompactFilter
                      value={source}
                      options={[
                        { value: "all", label: uiText("全部来源") },
                        { value: "system", label: uiText("系统") },
                        { value: "project", label: uiText("项目") },
                        { value: "package", label: "Package" },
                        { value: "custom", label: uiText("自定义") }
                      ]}
                      onChange={(value) => setSource(value as typeof source)}
                    />
                  ) : null}
                </div>
                {tab === "tools" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("readonly")}>{uiText("最小只读")}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("creative")}>{uiText("创作默认")}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("all")}>{uiText("全部启用")}</Button>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {!inventory ? (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                    {!resourceError ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {uiText(resourceError ? "暂时无法读取列表，请点击上方刷新重试。" : "正在读取列表…")}</div>
                ) : visibleItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">{uiText("没有匹配结果")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{uiText("调整关键词、来源或启用状态。")}</p>
                  </div>
                ) : visibleItems.map((item) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={item.id}
                    onClick={(event) => {
                      setSelectedId(item.id);
                      if ((event.currentTarget.closest<HTMLElement>(".pi-agent-settings")?.clientWidth ?? window.innerWidth) <= 720) setCompactDetailOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                        if ((event.currentTarget.closest<HTMLElement>(".pi-agent-settings")?.clientWidth ?? window.innerWidth) <= 720) setCompactDetailOpen(true);
                      }
                    }}
                    className={cn(
                      "pi-resource-item",
                      selectedItem?.id === item.id && "pi-resource-item--selected"
                    )}
                  >
                    <span className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      item.enabled ? "bg-[hsl(var(--success))]" : "bg-muted-foreground/30"
                    )} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong className="truncate font-mono text-xs font-medium">{item.name}</strong>
                        {item.badge ? <small className="shrink-0 text-[10px] text-muted-foreground">{uiText(item.badge)}</small> : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.description}</span>
                    </span>
                    {item.kind !== "assistant-skill" ? (
                      <Switch
                        checked={item.enabled}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(next) => toggleItem(item, next)}
                        aria-label={`${uiText(item.enabled ? "停用" : "启用")} ${item.name}`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>

              {(tab === "skills" || tab === "extensions") ? (
                <div className="border-t border-border/80 px-4 py-3">
                  <PiAgentCustomPathInput
                    value={tab === "skills" ? customSkillPath : customExtensionPath}
                    placeholder={tab === "skills" ? uiText("添加 Skill 文件或目录") : uiText("添加扩展文件或目录")}
                    onChange={tab === "skills" ? setCustomSkillPath : setCustomExtensionPath}
                    onAdd={() => addCustomPath(tab === "skills" ? "skill" : "extension")}
                  />
                </div>
              ) : null}
              <PaginationFooter page={page} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />
            </section>

            <PiAgentItemDetail
              item={selectedItem}
              detail={resourceDetail}
              loading={detailLoading}
              error={detailError}
              onToggle={toggleItem}
              onEditAssistantSkill={onEditAssistantSkill}
            />
          </>
        )}
        </div>
      </div>
      <Dialog open={compactDetailOpen} onOpenChange={setCompactDetailOpen}>
        <DialogContent className="settings-aux-dialog max-h-[88vh] max-w-lg overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{uiText("工具与技能详情")}</DialogTitle>
            <DialogDescription>{uiText("查看所选工具、Skill 或扩展的详细信息。")}</DialogDescription>
          </DialogHeader>
          <PiAgentItemDetail
            item={selectedItem}
            detail={resourceDetail}
            loading={detailLoading}
            error={detailError}
            compact
            onToggle={toggleItem}
            onEditAssistantSkill={(id) => {
              setCompactDetailOpen(false);
              onEditAssistantSkill(id);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PiAgentOverview({
  available,
  enabled,
  model,
  toolCount,
  skillCount,
  extensionCount,
  maxTurns,
  webSearchMaxResults,
  onMaxTurnsChange,
  onWebSearchMaxResultsChange
}: {
  available: boolean;
  enabled: boolean;
  model?: string;
  toolCount: number;
  skillCount: number;
  extensionCount: number;
  maxTurns: number;
  webSearchMaxResults: number;
  onMaxTurnsChange: (value: number) => void;
  onWebSearchMaxResultsChange: (value: number) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <section className="pi-overview">
      <div className="pi-overview-guide">
        <h3>{uiText("开启后能帮你做什么？")}</h3>
        <p>{uiText("在“可执行操作”中选择允许的能力，助手会根据任务按需使用。")}</p>
        <ul>
          <li><strong>{uiText("查找与理解")}</strong><span>{uiText("读取画板、查找素材，了解当前创作内容。")}</span></li>
          <li><strong>{uiText("生成与修改")}</strong><span>{uiText("调用已配置的图片模型，生成图片或调整画面。")}</span></li>
          <li><strong>{uiText("整理与交付")}</strong><span>{uiText("整理画板内容，导出你需要的结果。")}</span></li>
        </ul>
      </div>
      <dl className="pi-overview-summary">
        {[
          ["当前状态", !available ? "等待配置模型" : enabled ? "可执行操作" : "仅提供建议"],
          ["对话模型", model || "未选择"],
          ["已允许的操作", uiText("{{ui:0}} 个", [toolCount])],
          ["自定义能力", uiText("{{ui:0}} 个指南 · {{ui:1}} 个扩展", [skillCount, extensionCount])]
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{uiText(label)}</dt>
            <dd title={value}>{uiText(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="pi-overview-body">
        <SettingsGroup title={uiText("任务设置")}>
          <p className="pi-overview-description">{uiText("调整一次任务的处理次数和搜索参考数量。")}</p>
          <PiAgentSettingRow
            title={uiText("单次任务步数")}
            description={uiText("一次任务最多进行多少轮处理，复杂任务可适当调高。")}
          >
            <PiAgentChoiceSelect label={uiText("单次任务步数")} value={maxTurns}
              values={[4, 8, 12, 16, 20, 24]} unit={uiText("步")} onChange={onMaxTurnsChange} />
          </PiAgentSettingRow>
          <PiAgentSettingRow
            title={uiText("搜索参考数量")}
            description={uiText("每次搜索最多提供给助手的来源数量。")}
          >
            <PiAgentChoiceSelect label={uiText("搜索参考数量")} value={webSearchMaxResults}
              values={[3, 5, 8, 10]} unit={uiText("条")} onChange={onWebSearchMaxResultsChange} />
          </PiAgentSettingRow>
        </SettingsGroup>

        <aside className="pi-overview-aside">
          <h3 className="text-sm font-semibold">{uiText("执行前你需要知道")}</h3>
          <ul className="pi-permission-notes">
            <li>{uiText("创作指南只影响工作方式，不会增加操作权限。")}</li>
            <li>{uiText("自定义指南和高级扩展都是可选项。")}</li>
            <li>{uiText("修改画板时，只操作当前画板。")}</li>
            <li>{uiText("生成、覆盖、删除和导出会先向你确认。")}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

function PiAgentItemDetail({
  item,
  detail,
  loading,
  error,
  compact = false,
  onToggle,
  onEditAssistantSkill
}: {
  item: PiAgentCatalogItem | null;
  detail: PiAgentResourceDetail | null;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  onToggle: (item: PiAgentCatalogItem, next: boolean) => void;
  onEditAssistantSkill: (id: string) => void;
}): React.ReactElement {
  const uiText = useUiText();

  if (!item) {
    return <aside className={cn("pi-resource-detail pi-resource-detail--empty", compact && "pi-resource-detail--compact")}>{uiText("选择一项查看详情")}</aside>;
  }
  return (
    <aside className={cn("pi-resource-detail", compact && "pi-resource-detail--compact")}>
      <div className={cn("flex items-start justify-between gap-4", compact && "pr-9")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="break-all font-mono text-sm font-semibold">{item.name}</h3>
            {item.badge ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{uiText(item.badge)}</span> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description || uiText("没有提供说明。")}</p>
        </div>
        {item.kind === "assistant-skill" && item.assistantSkill ? (
          <Button type="button" size="sm" onClick={() => onEditAssistantSkill(item.assistantSkill!.id)}>
            <Pencil className="h-3.5 w-3.5" />
            {uiText("编辑")}</Button>
        ) : (
          <Switch aria-label={`${uiText(item.enabled ? "停用" : "启用")} ${item.name}`} checked={item.enabled} onCheckedChange={(next) => onToggle(item, next)} />
        )}
      </div>

      <dl className="mt-5 divide-y divide-border/70 border-y border-border/70 text-xs">
        <DetailRow label={uiText("类型")} value={catalogKindLabel(item.kind)} />
        <DetailRow label={uiText("状态")} value={item.enabled ? uiText("已启用") : uiText("未启用")} />
        {item.source ? <DetailRow label={uiText("来源")} value={sourceLabel(item.source)} /> : null}
        {item.resource?.packageName ? <DetailRow label="Package" value={item.resource.packageName} mono /> : null}
        {item.path ? <DetailRow label={uiText("路径")} value={item.path} mono /> : null}
      </dl>

      {item.resource?.warning ? (
        <p className="mt-4 rounded-md bg-[hsl(var(--warning)/0.1)] p-3 text-xs leading-5 text-[hsl(var(--warning))]">
          {item.resource.warning}
        </p>
      ) : null}
      {(item.kind === "skill" || item.kind === "extension") ? (
        <div className="mt-5">
          <h4 className="text-xs font-semibold">{item.kind === "skill" ? uiText("Skill 内容") : uiText("扩展代码")}</h4>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {uiText("正在读取…")}</div>
          ) : error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : (
            <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/80 bg-muted/25 p-3 font-mono text-[11px] leading-5">
              {detail?.content || uiText("没有可预览内容。")}
            </pre>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-border/80 bg-muted/20 p-4">
          <h4 className="text-xs font-semibold">{uiText("什么时候使用")}</h4>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {item.kind === "assistant-skill"
              ? uiText("进入对应助手场景时自动加载。用户覆盖版本只影响新会话。")
              : item.kind === "builtin-tool"
                ? uiText("由模型按任务需要调用。写入和执行类工具应保持最小授权。")
                : uiText("用于读取或操作当前 Iterlay 工作区，写操作仍受宿主权限和确认限制。")}
          </p>
        </div>
      )}
    </aside>
  );
}

function CompactFilter({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <div className="pi-compact-filter">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {uiText(option.label)}
        </button>
      ))}
    </div>
  );
}

function PaginationFooter({
  page,
  pageCount,
  total,
  onPageChange
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <footer className="flex h-11 shrink-0 items-center justify-between border-t border-border/80 px-4 text-[10px] text-muted-foreground">
      <span>{uiText("共 ")}{total} {uiText("项")}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded p-1 hover:bg-accent disabled:opacity-30">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums">{page} / {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded p-1 hover:bg-accent disabled:opacity-30">
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </footer>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.ReactElement {
  const uiText = useUiText();
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-all text-foreground", mono && "font-mono text-[11px]")}>{uiText(value)}</dd>
    </div>
  );
}

function sourceLabel(source: PiAgentResourceEntry["source"]): string {
  return source === "system" ? "系统" : source === "project" ? "项目" : source === "package" ? "Package" : "自定义";
}

function catalogKindLabel(kind: PiAgentCatalogItem["kind"]): string {
  if (kind === "builtin-tool") return "内置工具";
  if (kind === "iterlay-tool") return "Iterlay 工具";
  if (kind === "assistant-skill") return "助手场景 Skill";
  if (kind === "skill") return "Skill";
  return "本地扩展";
}

function PiAgentCustomPathInput({
  value,
  placeholder,
  onChange,
  onAdd
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex gap-2 py-2.5">
      <Input
        className="h-8 min-w-0 font-mono text-xs"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onAdd();
          }
        }}
      />
      <Button type="button" size="sm" variant="outline" className="shrink-0 whitespace-nowrap" disabled={!value.trim()} onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        <span className="max-[680px]:hidden">{uiText("添加")}</span>
      </Button>
    </div>
  );
}

function PiAgentSettingRow({
  title,
  description,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}): React.ReactElement {
  return <SettingsRow title={title} description={description} control={children} />;
}

function PiAgentChoiceSelect({ label, value, values, unit, onChange }: {
  label: string; value: number; values: number[]; unit: string; onChange: (value: number) => void;
}): React.ReactElement {
  return <div className="pi-task-select">
    <select aria-label={label} value={value} onChange={(event) => {
      const next = Number(event.target.value);
      if (values.includes(next)) onChange(next);
    }}>
      {values.map((option) => <option key={option} value={option}>{option} {unit}</option>)}
    </select>
    <ChevronDown aria-hidden="true" />
  </div>;
}
