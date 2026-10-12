import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import type { AssistantSkillSummary, PiAgentBuiltinToolName, PiAgentResourceDetail, PiAgentResourceEntry, PiAgentResourceInventory } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

const SETTINGS_OPTION_SELECTED_CLASS = "bg-card text-foreground shadow-sm ring-1 ring-foreground/20";

type PiAgentPanelTab = "overview" | "tools" | "assistant-skills" | "skills" | "extensions";

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
  onBuiltinToolsChange,
  onIterlayToolsChange,
  onSkillPathsChange,
  onExtensionPathsChange,
  onCustomSkillPathsChange,
  onCustomExtensionPathsChange,
  onMaxTurnsChange,
  onWebSearchMaxResultsChange,
  onRefresh,
  onEditAssistantSkill
}: {
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
  const [tab, setTab] = useState<PiAgentPanelTab>("overview");
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
    <div className="flex min-h-full flex-col bg-background">
      <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-5 border-b border-border/80 px-6 py-3 max-[680px]:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="whitespace-nowrap text-base font-semibold">Pi Agent</h2>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              enabled && available
                ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                : "bg-muted text-muted-foreground"
            )}>
              {enabled && available ? "已启用" : "兼容模式"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground max-[680px]:hidden">
            管理所有助手使用的工具、场景 Skill 和本地扩展。Web 搜索始终可用。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button type="button" size="sm" variant="outline" className="max-[680px]:h-8 max-[680px]:w-8 max-[680px]:px-0" title="刷新资源" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="max-[680px]:hidden">刷新资源</span>
          </Button>
          <Switch
            checked={enabled && available}
            disabled={!available}
            onCheckedChange={onEnabledChange}
            aria-label="所有助手使用 Pi Agent"
          />
        </div>
      </header>

      {resourceError ? <p className="border-b border-border/70 px-6 py-2 text-xs text-destructive">{resourceError}</p> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(320px,0.92fr)_minmax(320px,1.08fr)] max-[980px]:grid-cols-[150px_minmax(0,1fr)] max-[680px]:grid-cols-1">
        <nav className="border-r border-border/80 bg-muted/20 p-3 max-[680px]:flex max-[680px]:overflow-x-auto max-[680px]:border-b max-[680px]:border-r-0" aria-label="Pi Agent 配置分类">
          {([
            ["overview", "总览", ""],
            ["tools", "工具", inventory ? String(inventory.builtinTools.length + inventory.iterlayTools.length) : "—"],
            ["assistant-skills", "场景 Skill", String(assistantSkills.length)],
            ["skills", "其他 Skill", inventory ? String(inventory.skills.length) : "—"],
            ["extensions", "扩展", inventory ? String(inventory.extensions.length) : "—"]
          ] as Array<[PiAgentPanelTab, string, string]>).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "mb-1 flex h-9 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-xs font-medium max-[680px]:mb-0 max-[680px]:w-auto max-[680px]:shrink-0",
                tab === value ? SETTINGS_OPTION_SELECTED_CLASS : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <span>{label}</span>
              {count ? <span className="text-[10px] tabular-nums opacity-65">{count}</span> : null}
            </button>
          ))}
        </nav>

        {tab === "overview" ? (
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
            <section className="flex min-h-0 flex-col border-r border-border/80 max-[980px]:border-r-0">
              <div className="space-y-3 border-b border-border/80 p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`搜索${tab === "tools" ? "工具" : tab === "extensions" ? "扩展" : "Skill"}…`}
                    className="h-9 pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CompactFilter
                    value={status}
                    options={[
                      { value: "all", label: "全部" },
                      { value: "enabled", label: "已启用" },
                      { value: "disabled", label: "未启用" }
                    ]}
                    onChange={(value) => setStatus(value as typeof status)}
                  />
                  {(tab === "skills" || tab === "extensions") ? (
                    <CompactFilter
                      value={source}
                      options={[
                        { value: "all", label: "全部来源" },
                        { value: "system", label: "系统" },
                        { value: "project", label: "项目" },
                        { value: "package", label: "Package" },
                        { value: "custom", label: "自定义" }
                      ]}
                      onChange={(value) => setSource(value as typeof source)}
                    />
                  ) : null}
                </div>
                {tab === "tools" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("readonly")}>最小只读</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("creative")}>创作默认</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => applyToolPreset("all")}>全部启用</Button>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {!inventory ? (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在读取资源…
                  </div>
                ) : visibleItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">没有匹配结果</p>
                    <p className="mt-1 text-xs text-muted-foreground">调整关键词、来源或启用状态。</p>
                  </div>
                ) : visibleItems.map((item) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      if (window.innerWidth < 980) setCompactDetailOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                        if (window.innerWidth < 980) setCompactDetailOpen(true);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors",
                      selectedItem?.id === item.id ? "bg-accent/65" : "hover:bg-accent/30"
                    )}
                  >
                    <span className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      item.enabled ? "bg-[hsl(var(--success))]" : "bg-muted-foreground/30"
                    )} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong className="truncate font-mono text-xs font-medium">{item.name}</strong>
                        {item.badge ? <small className="shrink-0 text-[10px] text-muted-foreground">{item.badge}</small> : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.description}</span>
                    </span>
                    {item.kind !== "assistant-skill" ? (
                      <Switch
                        checked={item.enabled}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(next) => toggleItem(item, next)}
                        aria-label={`${item.enabled ? "停用" : "启用"} ${item.name}`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>

              {(tab === "skills" || tab === "extensions") ? (
                <div className="border-t border-border/80 px-4 py-3">
                  <PiAgentCustomPathInput
                    value={tab === "skills" ? customSkillPath : customExtensionPath}
                    placeholder={tab === "skills" ? "添加 Skill 文件或目录" : "添加扩展文件或目录"}
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
      <Dialog open={compactDetailOpen} onOpenChange={setCompactDetailOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto p-0 min-[980px]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Pi Agent 资源详情</DialogTitle>
            <DialogDescription>查看所选工具、Skill 或扩展的详细信息。</DialogDescription>
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
  return (
    <section className="col-span-2 min-h-0 overflow-y-auto p-6 max-[980px]:col-span-1">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["运行状态", enabled && available ? "Pi Agent" : "旧助手模式"],
          ["官方模型", model || "尚未读取"],
          ["启用工具", `${toolCount} 个`],
          ["扩展能力", `${skillCount} Skills · ${extensionCount} 扩展`]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border/80 bg-card p-4">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <strong className="mt-2 block truncate text-sm font-semibold">{value}</strong>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-md border border-border/80">
          <div className="border-b border-border/80 px-4 py-3">
            <h3 className="text-sm font-semibold">运行策略</h3>
            <p className="mt-1 text-xs text-muted-foreground">控制单次请求的成本、时延和搜索信息量。</p>
          </div>
          <PiAgentSettingRow
            title="最大 Agent 轮数"
            description="达到上限后停止继续调用模型和工具。复杂任务需要更多轮次。"
          >
            <select
              value={maxTurns}
              onChange={(event) => onMaxTurnsChange(Number(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              {[4, 8, 12, 16, 20, 24].map((value) => <option key={value} value={value}>{value} 轮</option>)}
            </select>
          </PiAgentSettingRow>
          <PiAgentSettingRow
            title="Web 搜索结果上限"
            description="每次搜索最多交给 Agent 的来源数量；Web 搜索始终可用。"
          >
            <select
              value={webSearchMaxResults}
              onChange={(event) => onWebSearchMaxResultsChange(Number(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              {[3, 5, 8, 10].map((value) => <option key={value} value={value}>{value} 条</option>)}
            </select>
          </PiAgentSettingRow>
        </div>

        <aside className="rounded-md border border-border/80 bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">权限边界</h3>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
            <li>• 场景 Skill 决定助手行为，但不能提升工具权限。</li>
            <li>• 扩展是本地可执行代码，默认关闭。</li>
            <li>• 画板写操作锁定当前画板。</li>
            <li>• 生成、覆盖、删除和导出仍经过宿主确认。</li>
          </ul>
          {!available ? (
            <p className="mt-4 rounded-md bg-destructive/8 p-3 text-xs text-destructive">
              当前文本 Provider 尚未就绪；官方模型需要声明 Function Calling，第三方模型需要配置地址、模型与 API Key。
            </p>
          ) : null}
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
  if (!item) {
    return <aside className={cn("flex min-h-0 items-center justify-center p-6 text-xs text-muted-foreground", !compact && "max-[980px]:hidden")}>选择一项查看详情</aside>;
  }
  return (
    <aside className={cn("min-h-0 overflow-y-auto p-5", !compact && "max-[980px]:hidden")}>
      <div className={cn("flex items-start justify-between gap-4", compact && "pr-9")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="break-all font-mono text-sm font-semibold">{item.name}</h3>
            {item.badge ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.badge}</span> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description || "没有提供说明。"}</p>
        </div>
        {item.kind === "assistant-skill" && item.assistantSkill ? (
          <Button type="button" size="sm" onClick={() => onEditAssistantSkill(item.assistantSkill!.id)}>
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </Button>
        ) : (
          <Switch checked={item.enabled} onCheckedChange={(next) => onToggle(item, next)} />
        )}
      </div>

      <dl className="mt-5 divide-y divide-border/70 border-y border-border/70 text-xs">
        <DetailRow label="类型" value={catalogKindLabel(item.kind)} />
        <DetailRow label="状态" value={item.enabled ? "已启用" : "未启用"} />
        {item.source ? <DetailRow label="来源" value={sourceLabel(item.source)} /> : null}
        {item.resource?.packageName ? <DetailRow label="Package" value={item.resource.packageName} mono /> : null}
        {item.path ? <DetailRow label="路径" value={item.path} mono /> : null}
      </dl>

      {item.resource?.warning ? (
        <p className="mt-4 rounded-md bg-[hsl(var(--warning)/0.1)] p-3 text-xs leading-5 text-[hsl(var(--warning))]">
          {item.resource.warning}
        </p>
      ) : null}
      {(item.kind === "skill" || item.kind === "extension") ? (
        <div className="mt-5">
          <h4 className="text-xs font-semibold">{item.kind === "skill" ? "Skill 内容" : "扩展代码"}</h4>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取…
            </div>
          ) : error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : (
            <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/80 bg-muted/25 p-3 font-mono text-[11px] leading-5">
              {detail?.content || "没有可预览内容。"}
            </pre>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-border/80 bg-muted/20 p-4">
          <h4 className="text-xs font-semibold">什么时候使用</h4>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {item.kind === "assistant-skill"
              ? "进入对应助手场景时自动加载。用户覆盖版本只影响新会话。"
              : item.kind === "builtin-tool"
                ? "由模型按任务需要调用。写入和执行类工具应保持最小授权。"
                : "用于读取或操作当前 Iterlay 工作区，写操作仍受宿主权限和确认限制。"}
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
  return (
    <div className="flex rounded-md bg-muted/70 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded px-2 text-[10px] font-medium",
            value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
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
  return (
    <footer className="flex h-11 shrink-0 items-center justify-between border-t border-border/80 px-4 text-[10px] text-muted-foreground">
      <span>共 {total} 项</span>
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
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-all text-foreground", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

function sourceLabel(source: PiAgentResourceEntry["source"]): string {
  return source === "system" ? "系统" : source === "project" ? "项目" : source === "package" ? "Package" : "自定义";
}

function catalogKindLabel(kind: PiAgentCatalogItem["kind"]): string {
  if (kind === "builtin-tool") return "Pi 内置工具";
  if (kind === "iterlay-tool") return "Iterlay 工具";
  if (kind === "assistant-skill") return "助手场景 Skill";
  if (kind === "skill") return "Skill";
  return "Pi 扩展";
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
      <Button type="button" size="sm" variant="outline" disabled={!value.trim()} onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        <span className="max-[680px]:hidden">添加</span>
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
  return (
    <div className="flex flex-col gap-3.5 px-4 py-4 transition-colors duration-150">
      <div className="flex items-center justify-between gap-8">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-5 text-foreground">{title}</span>
          {description ? <span className="max-w-[64ch] text-xs leading-5 text-muted-foreground">{description}</span> : null}
        </span>
      </div>
      {children}
    </div>
  );
}
