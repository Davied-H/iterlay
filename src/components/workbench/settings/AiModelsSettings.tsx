import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/workbench/Field";
import { useUiText } from "@/i18n";
import {
  connectionOwnerId,
  connectionState,
  modelChoices,
  modelServiceKey,
  modelServices,
  removeModelService,
  selectDefaultModel,
  upsertModelService,
  type ConnectionState,
  type ModelChoice,
  type ModelKind,
  type ModelService,
  type ModelSettingsSnapshot
} from "@/lib/ai-model-settings";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { createCodexProvider } from "@/lib/provider-settings";
import { cn } from "@/lib/utils";
import { getProviderModels } from "@shared/provider-models";
import type {
  CodexAuthStatus,
  ProviderConfig,
  ProviderType,
  TextProviderConfig,
  VideoProviderConfig
} from "@shared/types";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle
} from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import "./ai-model-settings.css";
import {
  addVideoProviderModel,
  ApiKeyInput,
  createCodexTextProvider,
  createProvider,
  createVideoProvider,
  FAL_DEFAULTS,
  FalModelCombobox,
  MODE_DEFAULTS,
  PLATFORM_DEFAULTS,
  ProviderModelCombobox,
  ProviderModelsEditor,
  SIGNED_OUT_CODEX_STATUS,
  videoProviderDefaults,
  VideoProviderModelAddControl,
  VideoProviderModelsEditor,
  type ProviderSettingsDialogProps
} from "./provider-settings-components";

const KINDS = ["image", "text", "video"] as const;
const KIND_LABELS = { image: "图片生成", text: "文本模型", video: "视频生成" };
const PLATFORM_LABELS: Record<string, string> = {
  official: "Iterlay",
  "codex-oauth": "Codex / ChatGPT",
  "openai-compatible": "OpenAI Compatible",
  fal: "fal.ai",
  openrouter: "OpenRouter",
  bailian: "阿里云百炼",
  ark: "火山方舟",
  poe: "Poe",
  minimax: "MiniMax"
};
const PLATFORMS: Array<{
  type: string;
  description: string;
  kinds: ModelKind[];
}> = [
  {
    type: "codex-oauth",
    description: "使用 ChatGPT 账号连接",
    kinds: ["image", "text"]
  },
  {
    type: "openai-compatible",
    description: "接入 OpenAI 或兼容服务",
    kinds: ["image", "text"]
  },
  { type: "fal", description: "图片与视频模型平台", kinds: ["image", "video"] },
  {
    type: "openrouter",
    description: "通过统一接口接入模型",
    kinds: ["image", "video"]
  },
  { type: "bailian", description: "Qwen 图片生成与编辑", kinds: ["image"] },
  {
    type: "ark",
    description: "Seedream 图片与 Seedance 视频",
    kinds: ["image", "video"]
  },
  {
    type: "poe",
    description: "通过 Poe Images API 生成图片",
    kinds: ["image"]
  },
  { type: "minimax", description: "MiniMax 视频生成", kinds: ["video"] }
];
const REASONS: Record<ConnectionState["reason"], string> = {
  managed: "内置服务",
  account: "账号已连接",
  key: "未验证",
  "missing-key": "需要 API Key",
  login: "需要登录",
  "missing-config": "待完善配置",
  "missing-connection": "关联服务不存在"
};
export interface AiModelsSettingsHandle {
  requestLeave: (action: () => void) => void;
}
type Props = Pick<
  ProviderSettingsDialogProps,
  | "providers"
  | "activeProviderId"
  | "textProviders"
  | "activeTextProviderId"
  | "videoProviders"
  | "activeVideoProviderId"
  | "providerKeyStatus"
  | "bridgeError"
  | "onSaved"
  | "entryPoint"
> & {
  ref?: Ref<AiModelsSettingsHandle>;
  portalContainer: HTMLElement | null;
  navigation?: ReactNode;
  embedded?: boolean;
};
type Draft = ModelService & { isNew: boolean; key: string; original: string };
type TestResult = { ok: boolean; message: string; checkedAt?: number };

function serviceFingerprint(service: ModelService): string {
  return JSON.stringify(service);
}
function PlatformMark({ type, small = false }: { type: string; small?: boolean }): React.ReactElement {
  const Icon =
    type === "codex-oauth"
      ? UserRound
      : type === "official"
        ? ShieldCheck
        : type === "openai-compatible"
          ? Plug
          : undefined;
  const letters: Record<string, string> = {
    fal: "fal",
    openrouter: "OR",
    bailian: "Q",
    ark: "A",
    poe: "P",
    minimax: "M"
  };
  return (
    <span className={cn("model-platform-mark", small && "model-platform-mark--small")} aria-hidden="true">
      {Icon ? <Icon /> : <span>{letters[type] || "AI"}</span>}
    </span>
  );
}
function Status({ state, result }: { state: ConnectionState; result?: TestResult }): React.ReactElement {
  const uiText = useUiText();
  const good = state.ready && (result?.ok || state.reason === "account");
  return (
    <span
      className={cn(
        "model-status",
        good ? "model-status--good" : !state.ready || result?.ok === false ? "model-status--attention" : ""
      )}
    >
      <span className="model-status-dot" />
      {uiText(
        !state.ready
          ? REASONS[state.reason]
          : result
            ? result.ok
              ? "验证成功"
              : "验证失败"
            : REASONS[state.reason]
      )}
    </span>
  );
}

export function AiModelsSettings({
  ref,
  portalContainer,
  onSaved,
  entryPoint,
  bridgeError,
  providerKeyStatus,
  navigation,
  embedded = false,
  ...initial
}: Props): React.ReactElement {
  const uiText = useUiText();
  const [snapshot, setSnapshot] = useState<ModelSettingsSnapshot>(initial);
  const [keys, setKeys] = useState(providerKeyStatus);
  const [accounts, setAccounts] = useState<Record<string, CodexAuthStatus>>({});
  const [view, setView] = useState<"overview" | "add" | "edit">(
    entryPoint === "provider-setup" ? "add" : "overview"
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [addKind, setAddKind] = useState<ModelKind | "all">("all");
  const [filter, setFilter] = useState<ModelKind | "all">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "default" | "delete" | null>(null);
  const [authAction, setAuthAction] = useState<"sign-in" | "refresh" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [verified, setVerified] = useState<Record<string, TestResult>>({});
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [deleting, setDeleting] = useState<ModelService | null>(null);
  const [notice, setNotice] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const dirty = Boolean(
    draft &&
      (draft.key ||
        serviceFingerprint({ kind: draft.kind, provider: draft.provider }) !== draft.original ||
        draft.isNew)
  );
  const locked = Boolean(busy || authAction || bridgeError);
  const allServices = modelServices(snapshot);

  useEffect(() => {
    setSnapshot({
      providers: initial.providers,
      activeProviderId: initial.activeProviderId,
      textProviders: initial.textProviders,
      activeTextProviderId: initial.activeTextProviderId,
      videoProviders: initial.videoProviders,
      activeVideoProviderId: initial.activeVideoProviderId
    });
  }, [
    initial.providers,
    initial.activeProviderId,
    initial.textProviders,
    initial.activeTextProviderId,
    initial.videoProviders,
    initial.activeVideoProviderId
  ]);
  useEffect(() => {
    setKeys(providerKeyStatus);
  }, [providerKeyStatus]);
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo(0, 0);
  }, [error]);
  useEffect(() => {
    mounted.current = true;
    if (!bridgeError)
      void getImageWorkbenchApi()
        .getSettings()
        .then((settings) => {
          if (mounted.current) setAccounts(settings.codexAuthStatusByProviderId ?? {});
        })
        .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, [bridgeError]);

  function requestLeave(action: () => void): void {
    if (busy || authAction) return;
    if (dirty) setPendingLeave(() => action);
    else action();
  }
  useImperativeHandle(ref, () => ({ requestLeave }));

  function openView(next: "add" | "edit", service?: ModelService, kind: ModelKind | "all" = "all"): void {
    if (next === "add") setAddKind(kind);
    listScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    revision.current++;
    setError(null);
    setTestResult(null);
    setNotice("");
    setDraft(
      service
        ? {
            ...service,
            isNew: false,
            key: "",
            original: serviceFingerprint(service)
          }
        : null
    );
    setView(next);
    scrollRef.current?.scrollTo(0, 0);
  }
  function returnToList(): void {
    revision.current++;
    setDraft(null);
    setView("overview");
    setError(null);
    setTestResult(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo(0, listScrollTop.current));
  }
  function patch(
    partial: Partial<ProviderConfig> | Partial<TextProviderConfig> | Partial<VideoProviderConfig>
  ): void {
    const connectionChanged = Object.keys(partial).some((key) => key !== "name");
    if (connectionChanged) revision.current++;
    setDraft((current) =>
      current
        ? ({
            ...current,
            provider: { ...current.provider, ...partial }
          } as Draft)
        : current
    );
    if (connectionChanged) setTestResult(null);
    setError(null);
  }
  function choosePlatform(type: string, kind: ModelKind): void {
    const id = `${kind}-provider-${crypto.randomUUID().slice(0, 8)}`;
    let provider: ModelService["provider"];
    if (kind === "image") {
      provider =
        type === "codex-oauth"
          ? createCodexProvider(id)
          : type === "fal"
            ? {
                ...createProvider(1),
                id,
                name: "fal.ai",
                type: "fal",
                ...FAL_DEFAULTS
              }
            : type === "openai-compatible"
              ? { ...createProvider(1), id, name: "OpenAI Compatible" }
              : {
                  ...createProvider(1),
                  id,
                  type: type as ProviderType,
                  ...PLATFORM_DEFAULTS[type as keyof typeof PLATFORM_DEFAULTS]
                };
    } else if (kind === "text") {
      const existing = snapshot.providers.find((item) => item.type === "codex-oauth");
      provider =
        type === "codex-oauth"
          ? createCodexTextProvider(id, existing?.id || id)
          : {
              id,
              type: "openai-compatible",
              name: "OpenAI Compatible",
              baseUrl: "",
              model: ""
            };
    } else {
      provider = {
        ...createVideoProvider(1),
        id,
        type: type as VideoProviderConfig["type"],
        ...videoProviderDefaults(type as VideoProviderConfig["type"])
      };
    }
    const service = { kind, provider };
    setDraft({
      ...service,
      isNew: true,
      key: "",
      original: serviceFingerprint(service)
    });
    setTestResult(null);
    setError(null);
    setView("edit");
    scrollRef.current?.scrollTo(0, 0);
    revision.current++;
  }

  async function commit(next: ModelSettingsSnapshot, apiKeys: Record<string, string> = {}): Promise<void> {
    await onSaved({ ...next, apiKeyByProviderId: apiKeys });
    if (!mounted.current) return;
    snapshotRef.current = next;
    setSnapshot(next);
    if (Object.keys(apiKeys).length)
      setKeys((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(apiKeys).map((id) => [id, true]))
      }));
  }

  async function changeDefault(choice: ModelChoice): Promise<void> {
    if (locked) return;
    setBusy("default");
    setError(null);
    setNotice("");
    try {
      await commit(selectDefaultModel(snapshotRef.current, choice));
      setVerified((current) => {
        const next = { ...current };
        delete next[modelServiceKey(choice)];
        return next;
      });
      setNotice(uiText("默认模型已更新"));
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, uiText("无法切换默认模型，请重试。")));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  function validateDraft(): string | null {
    if (!draft) return null;
    if (!draft.provider.name.trim()) return uiText("请输入服务名称。");
    if (!draft.provider.model.trim() && draft.provider.type !== "official")
      return uiText("请选择或输入模型 ID。");
    if (
      draft.provider.type !== "codex-oauth" &&
      draft.provider.type !== "official" &&
      !(draft.kind === "video" && (draft.provider as VideoProviderConfig).connectionProviderId)
    ) {
      try {
        const url = new URL(draft.provider.baseUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        return uiText("请输入有效的 HTTP 或 HTTPS 服务地址。");
      }
    }
    return null;
  }

  async function saveDraft(afterSave?: () => void): Promise<void> {
    if (!draft || locked) return;
    const invalid = validateDraft();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const base = snapshotRef.current;
      let next = upsertModelService(base, draft);
      const nextKeys = draft.key.trim() ? { ...keys, [connectionOwnerId(draft)]: true } : keys;
      // A new image account also exposes its linked text model, preserving the existing credential relationship.
      if (draft.isNew && draft.kind === "image" && draft.provider.type === "codex-oauth") {
        next = upsertModelService(next, {
          kind: "text",
          provider: createCodexTextProvider(`text-${draft.provider.id}`, draft.provider.id)
        });
      }
      for (const kind of KINDS) {
        const activeId =
          kind === "image"
            ? base.activeProviderId
            : kind === "text"
              ? base.activeTextProviderId
              : base.activeVideoProviderId;
        const current = modelServices(base).find(
          (item) => item.kind === kind && item.provider.id === activeId
        );
        if (current && connectionState(current, base, keys, accounts).ready) continue;
        const candidate = modelChoices(next, kind).find(
          (choice) => connectionState(choice, next, nextKeys, accounts).ready
        );
        if (candidate) next = selectDefaultModel(next, candidate);
      }
      await commit(next, draft.key.trim() ? { [connectionOwnerId(draft)]: draft.key.trim() } : {});
      setVerified((current) => {
        const copy = { ...current };
        delete copy[modelServiceKey(draft)];
        if (testResult) copy[modelServiceKey(draft)] = testResult;
        return copy;
      });
      setPendingLeave(null);
      returnToList();
      setNotice(uiText("服务已保存"));
      afterSave?.();
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, uiText("保存失败，请重试。")));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function testDraft(): Promise<void> {
    if (!draft || locked) return;
    const invalid = validateDraft();
    if (invalid) {
      setError(invalid);
      return;
    }
    const token = ++revision.current;
    setBusy("test");
    setTestResult(null);
    setError(null);
    try {
      const api = getImageWorkbenchApi();
      const override = draft.key.trim() || undefined;
      const result =
        draft.kind === "image"
          ? await api.testProvider(draft.provider as ProviderConfig, override)
          : draft.kind === "text"
            ? await api.testTextProvider(draft.provider as TextProviderConfig, override)
            : await api.testVideoProvider(draft.provider as VideoProviderConfig, override);
      if (mounted.current && revision.current === token) setTestResult({ ...result, checkedAt: Date.now() });
    } catch (cause) {
      if (mounted.current && revision.current === token)
        setTestResult({
          ok: false,
          checkedAt: Date.now(),
          message: getWorkbenchErrorMessage(cause, uiText("连接失败，请检查配置后重试。"))
        });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function accountAction(action: "sign-in" | "refresh" | "sign-out"): Promise<void> {
    if (!draft || locked) return;
    const owner = connectionOwnerId(draft);
    setAuthAction(action);
    setError(null);
    setTestResult(null);
    try {
      const api = getImageWorkbenchApi();
      const status =
        action === "sign-in"
          ? await api.startCodexAuth(owner)
          : action === "sign-out"
            ? await api.signOutCodex(owner)
            : await api.refreshCodexAuth(owner);
      if (mounted.current) setAccounts((current) => ({ ...current, [owner]: status }));
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, uiText("账号操作失败，请重试。")));
    } finally {
      if (mounted.current) setAuthAction(null);
    }
  }

  const deleteReferences =
    deleting?.kind === "image"
      ? snapshot.videoProviders.filter((provider) => provider.connectionProviderId === deleting.provider.id)
      : [];
  const linkedAccount =
    deleting?.kind === "text" && deleting.provider.type === "codex-oauth"
      ? snapshot.providers.find((provider) => provider.id === connectionOwnerId(deleting))
      : undefined;
  async function confirmDelete(): Promise<void> {
    if (!deleting || locked) return;
    setBusy("delete");
    setError(null);
    try {
      const next = removeModelService(snapshotRef.current, deleting);
      // Prefer another usable connection when the removed service was a default.
      for (const kind of KINDS) {
        const activeId =
          kind === "image"
            ? next.activeProviderId
            : kind === "text"
              ? next.activeTextProviderId
              : next.activeVideoProviderId;
        const current = modelServices(next).find(
          (service) => service.kind === kind && service.provider.id === activeId
        );
        if (!current || !connectionState(current, next, keys, accounts).ready) {
          const candidate = modelChoices(next, kind).find(
            (choice) => connectionState(choice, next, keys, accounts).ready
          );
          if (candidate) Object.assign(next, selectDefaultModel(next, candidate));
        }
      }
      await commit(next);
      setVerified((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key]) =>
              key !== modelServiceKey(deleting) &&
              !deleteReferences.some((provider) => key === `video:${provider.id}`)
          )
        )
      );
      setDeleting(null);
      setNotice(uiText("服务已删除"));
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, uiText("删除失败，请重试。")));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const visibleServices = allServices.filter(
    ({ kind, provider }) =>
      (filter === "all" || filter === kind) &&
      `${provider.name} ${provider.model} ${PLATFORM_LABELS[provider.type]} ${provider.baseUrl}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  const image = draft?.kind === "image" ? (draft.provider as ProviderConfig) : null;
  const text = draft?.kind === "text" ? (draft.provider as TextProviderConfig) : null;
  const video = draft?.kind === "video" ? (draft.provider as VideoProviderConfig) : null;
  const codex = draft?.provider.type === "codex-oauth";
  const official = draft?.provider.type === "official";
  const sharedConnection = video?.connectionProviderId
    ? snapshot.providers.find((provider) => provider.id === video.connectionProviderId)
    : null;
  const draftConnectionState = draft
    ? connectionState(
        draft,
        snapshot,
        draft.key.trim() ? { ...keys, [connectionOwnerId(draft)]: true } : keys,
        accounts
      )
    : null;

  return (
    <div className="ai-model-settings" data-view={view}>
      {!embedded ? <><DialogTitle className="sr-only">
        {view === "edit" && draft ? draft.provider.name || uiText("服务详情") : uiText("AI 模型")}
      </DialogTitle>
      <DialogDescription className="sr-only">
        {uiText("连接 AI 服务，为创作选择默认模型。")}
      </DialogDescription></> : null}
      <header className={cn("model-page-header", view !== "overview" && "model-page-header--editor")}>
        {view === "overview" ? (
          <>
            <div className="model-page-intro">
              <h2>{uiText("AI 模型")}</h2>
              <p title={uiText("连接服务，为图片、文本和视频选择模型。")}>
                {uiText("连接服务，为图片、文本和视频选择模型。")}
              </p>
            </div>
            <Button className="model-add-button" disabled={locked} onClick={() => openView("add")}>
              <Plus />
              {uiText("添加服务")}
            </Button>
          </>
        ) : (
          <div className="model-editor-heading">
            <button
              type="button"
              className="model-back-button"
              aria-label={uiText("返回服务列表")}
              title={uiText("返回服务列表")}
              disabled={Boolean(busy || authAction)}
              onClick={() => requestLeave(returnToList)}
            >
              <ArrowLeft />
            </button>
            <div className="model-editor-title">
              <h2 title={draft?.provider.name}>
                {view === "add" ? uiText("添加服务") : draft?.provider.name || uiText("服务详情")}
              </h2>
              {draft ? (
                <span className="model-detail-purpose">
                  {draft.provider.name.trim() !== PLATFORM_LABELS[draft.provider.type]
                    ? `${uiText(PLATFORM_LABELS[draft.provider.type])} · `
                    : ""}
                  {uiText(KIND_LABELS[draft.kind])}
                </span>
              ) : null}
            </div>
            {view === "edit" && draft && dirty && !official ? (
              <Button
                type="button"
                size="sm"
                className="model-detail-save"
                disabled={locked}
                onClick={() => void saveDraft()}
              >
                {busy === "save" ? <Loader2 className="animate-spin" /> : null}
                {uiText(draft.isNew ? "添加服务" : "保存更改")}
              </Button>
            ) : null}
          </div>
        )}
      </header>
      {view === "overview" ? navigation : null}
      <div ref={scrollRef} className="model-page-scroll">
        {bridgeError || error ? (
          <div className="model-feedback model-feedback--error" role="alert">
            <XCircle />
            <span>{bridgeError || error}</span>
          </div>
        ) : null}
        {notice ? (
          <p className="sr-only" role="status">
            {notice}
          </p>
        ) : null}
        {view === "overview" ? (
          <div className="model-overview">
            <section aria-labelledby="model-defaults-title" className="model-defaults-section">
              <div className="model-section-heading">
                <h3 id="model-defaults-title">{uiText("默认模型")}</h3>
                <span>{uiText("用于新建的 AI 任务")}</span>
              </div>
              <div className="model-defaults">
                {KINDS.map((kind) => (
                  <DefaultModelRow
                    key={kind}
                    kind={kind}
                    snapshot={snapshot}
                    keys={keys}
                    accounts={accounts}
                    disabled={locked}
                    saving={busy === "default"}
                    portalContainer={portalContainer}
                    onSelect={changeDefault}
                    onConnect={() => openView("add", undefined, kind)}
                    onEdit={(service) => openView("edit", service)}
                  />
                ))}
              </div>
            </section>
            <section aria-labelledby="model-services-title" className="model-services-section">

              {allServices.length ? (
                <>
                  <div className="model-list-toolbar">
                    <div className="model-section-title">
                      <h3 id="model-services-title">{uiText("我的服务")}</h3>
                      <span className="model-count">{allServices.length}</span>
                    </div>
                    <div className="model-filter-group" role="group" aria-label={uiText("按用途筛选服务")}>
                      {(["all", ...KINDS] as const).map((kind) => (
                        <button
                          type="button"
                          key={kind}
                          aria-pressed={filter === kind}
                          onClick={() => setFilter(kind)}
                        >
                          {uiText(
                            kind === "all"
                              ? "全部"
                              : kind === "image"
                                ? "图片"
                                : kind === "text"
                                  ? "文本"
                                  : "视频"
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="model-search">
                      <Search />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={uiText("搜索服务或模型")}
                        aria-label={uiText("搜索服务或模型")}
                      />
                    </div>
                  </div>
                  <div className="model-service-list">
                    <div className="model-service-columns" aria-hidden="true">
                      <span>{uiText("服务")}</span>
                      <span>{uiText("模型")}</span>
                      <span>{uiText("连接状态")}</span>
                      <span />
                    </div>
                    {visibleServices.map((service) => {
                      const { provider, kind } = service;
                      const state = connectionState(service, snapshot, keys, accounts);
                      const activeId =
                        kind === "image"
                          ? snapshot.activeProviderId
                          : kind === "text"
                            ? snapshot.activeTextProviderId
                            : snapshot.activeVideoProviderId;
                      return (
                        <div className="model-service-row" key={modelServiceKey(service)}>
                          <button
                            type="button"
                            className="model-service-main"
                            disabled={locked}
                            onClick={() => openView("edit", service)}
                            aria-label={uiText("编辑 {{ui:0}}", [provider.name])}
                          >
                            <span className="model-service-identity">
                              <span className="model-service-name">
                                <span className="model-service-title">
                                  {provider.name || uiText("未命名服务")}
                                </span>
                                <span className="model-service-purpose-tag">{uiText(kind === "image" ? "图片" : kind === "text" ? "文本" : "视频")}</span>
                                {provider.id === activeId ? (
                                  <span className="model-default-tag">{uiText("默认")}</span>
                                ) : null}
                              </span>
                            </span>
                            <span className="model-service-model">
                              <span title={provider.model}>{provider.model || uiText("平台默认模型")}</span>
                                {kind !== "text" && getProviderModels(provider).length > 1 ? (
                                  <small>+{getProviderModels(provider).length - 1}</small>
                                ) : null}
                            </span>

                            <Status state={state} result={verified[modelServiceKey(service)]} />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="model-service-actions"
                                disabled={locked}
                                aria-label={uiText("管理 {{ui:0}}", [provider.name])}
                              >
                                <MoreHorizontal />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="model-service-menu">
                              <DropdownMenuItem onSelect={() => openView("edit", service)}>
                                <Pencil />
                                {uiText(provider.type === "official" ? "查看配置" : "编辑服务")}
                              </DropdownMenuItem>
                              {provider.type !== "official" ? (
                                <DropdownMenuItem
                                  className="model-service-menu-delete"
                                  onSelect={() => {
                                    setError(null);
                                    setDeleting(service);
                                  }}
                                >
                                  <Trash2 />
                                  {uiText("删除服务")}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                    {!visibleServices.length ? (
                      <div className="model-search-empty">
                        <Search />
                        <p>{uiText("没有找到匹配的服务")}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          {uiText("清除筛选")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="model-empty-state">
                  <h3 id="model-services-title" className="sr-only">{uiText("我的服务")}</h3>
                  <span className="model-empty-icon">
                    <Plug />
                  </span>
                  <h4>{uiText("连接你的第一个 AI 服务")}</h4>
                  <p>{uiText("使用已有账号或 API Key，连接图片、文本与视频模型。")}</p>
                  <Button disabled={locked} onClick={() => openView("add")}>
                    <Plus />
                    {uiText("添加服务")}
                  </Button>
                </div>
              )}
            </section>
            <p className="model-local-note">
              <ShieldCheck />
              {uiText("凭据保存在本机，服务配置不随画板分享。")}
            </p>
          </div>
        ) : view === "add" ? (
          <div className="model-platform-picker">
            <div className="model-section-heading">
              <h3>{uiText("服务平台")}</h3>
              <span>{uiText("按需连接，可随时调整")}</span>
            </div>
            <div
              className="model-filter-group model-platform-filter"
              role="group"
              aria-label={uiText("选择服务用途")}
            >
              {(["all", ...KINDS] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={addKind === kind}
                  onClick={() => setAddKind(kind)}
                >
                  {uiText(kind === "all" ? "全部" : KIND_LABELS[kind])}
                </button>
              ))}
            </div>
            {PLATFORMS.filter((platform) => addKind === "all" || platform.kinds.includes(addKind)).map(
              (platform) => (
                <div className="model-platform-choice" key={platform.type}>
                  <PlatformMark type={platform.type} />
                  <div className="model-platform-copy">
                    <h3>{uiText(PLATFORM_LABELS[platform.type])}</h3>
                    <p>{uiText(platform.description)}</p>
                  </div>
                  <div className="model-platform-actions">
                    {platform.kinds
                      .filter((kind) => addKind === "all" || kind === addKind)
                      .map((kind) => (
                        <button
                          type="button"
                          key={kind}
                          disabled={locked}
                          onClick={() => choosePlatform(platform.type, kind)}
                        >
                          {uiText(kind === "image" ? "连接图片" : kind === "text" ? "连接文本" : "连接视频")}
                          <ArrowRight />
                        </button>
                      ))}
                  </div>
                </div>
              )
            )}
            <p className="model-local-note">
              <CircleHelp />
              {uiText("同一平台的不同用途独立配置；已有共享连接可以继续复用。")}
            </p>
          </div>
        ) : draft ? (
          <div className="model-editor">
            <fieldset disabled={Boolean(busy || authAction || bridgeError || official)}>
              <section className="model-form-section">
                <div className="model-form-heading">
                  <h3>{uiText(codex ? "登录账号" : "连接配置")}</h3>
                </div>
                <div className="model-form-fields">
                  {codex ? (
                    <>
                      {text && snapshot.providers.some((provider) => provider.type === "codex-oauth") ? (
                        <Field label={uiText("账号来源")}>
                          <Select
                            value={
                              snapshot.providers.some(
                                (provider) => provider.id === (text.authProviderId || text.id)
                              )
                                ? text.authProviderId || text.id
                                : "independent"
                            }
                            onValueChange={(value) =>
                              patch({ authProviderId: value === "independent" ? text.id : value })
                            }
                          >
                            <SelectTrigger aria-label={uiText("账号来源")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="independent">{uiText("独立账号")}</SelectItem>
                              {snapshot.providers
                                .filter((provider) => provider.type === "codex-oauth")
                                .map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : null}
                      <AccountConnection
                        status={accounts[connectionOwnerId(draft)] ?? SIGNED_OUT_CODEX_STATUS}
                        action={authAction}
                        onAction={accountAction}
                      />
                    </>
                  ) : !official ? (
                    <>
                      {video && ["fal", "openrouter"].includes(video.type) ? (
                        <Field label={uiText("连接配置")}>
                          <Select
                            value={video.connectionProviderId || "independent"}
                            onValueChange={(value) =>
                              patch({ connectionProviderId: value === "independent" ? undefined : value })
                            }
                          >
                            <SelectTrigger aria-label={uiText("连接配置")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="independent">{uiText("独立配置")}</SelectItem>
                              {snapshot.providers
                                .filter((provider) => provider.type === video.type)
                                .map((provider) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {uiText("复用图片服务 · ")}
                                    {provider.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : null}
                      <Field label={uiText("服务地址")}>
                        <Input
                          aria-label={uiText("服务地址")}
                          value={sharedConnection?.baseUrl ?? draft.provider.baseUrl}
                          disabled={Boolean(video?.connectionProviderId)}
                          onChange={(event) => patch({ baseUrl: event.target.value })}
                          placeholder="https://api.example.com"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </Field>
                      <Field label="API Key">
                        <ApiKeyInput
                          value={draft.key}
                          disabled={Boolean(locked || video?.connectionProviderId)}
                          placeholder={
                            video?.connectionProviderId
                              ? uiText("密钥由关联的图片服务管理")
                              : keys[draft.provider.id]
                                ? uiText("密钥已保存，留空即可继续使用")
                                : uiText("输入 API Key")
                          }
                          onValueChange={(value) => {
                            revision.current++;
                            setDraft((current) => (current ? { ...current, key: value } : current));
                            setTestResult(null);
                            setError(null);
                          }}
                        />
                      </Field>
                    </>
                  ) : (
                    <p className="model-field-note">{uiText("内置服务由 Iterlay 管理。")}</p>
                  )}
                </div>
              </section>
              <section className="model-form-section model-form-section--models">
                <div className="model-form-heading">
                  <h3>{uiText(codex ? (draft.kind === "image" ? "图片模型" : "文本模型") : "可用模型")}</h3>
                </div>
                <div className="model-form-fields">
                  {image && !codex && !official ? (
                    <ProviderModelsEditor
                      provider={image}
                      disabled={locked}
                      portalContainer={portalContainer}
                      apiKeyOverride={draft.key.trim() || undefined}
                      onChange={(model, models) => patch({ model, models })}
                    />
                  ) : null}
                  {image && codex ? (
                    <div className="model-fixed-model">
                      <div className="model-fixed-model-copy">
                        <div>
                          <strong>{image.model}</strong>
                          <span>{uiText("平台提供")}</span>
                        </div>
                        <p className="model-field-note">{uiText("模型由账号提供，无需手动配置。")}</p>
                      </div>
                    </div>
                  ) : null}
                  {text && !official ? (
                    <ProviderModelCombobox
                      value={text.model}
                      disabled={locked}
                      textProvider={text}
                      portalContainer={portalContainer}
                      apiKeyOverride={draft.key.trim() || undefined}
                      placeholder={uiText("选择或输入模型 ID")}
                      onChange={(model) => patch({ model })}
                    />
                  ) : null}
                  {video && !official ? (
                    <>
                      <VideoProviderModelsEditor
                        provider={video}
                        disabled={locked}
                        portalContainer={portalContainer}
                        onChange={(model, models) => patch({ model, models })}
                      />
                      <VideoProviderModelAddControl
                        provider={video}
                        disabled={locked}
                        portalContainer={portalContainer}
                        apiKeyOverride={draft.key.trim() || undefined}
                        onChange={(model) => patch(addVideoProviderModel(video, model))}
                      />
                    </>
                  ) : null}
                  {official ? (
                    <p className="model-field-note">{draft.provider.model || uiText("平台默认模型")}</p>
                  ) : null}
                  {!official && (!codex || draftConnectionState?.ready) ? (
                    <ConnectionVerification
                      result={testResult}
                      testing={busy === "test"}
                      configured={Boolean(draftConnectionState?.ready)}
                      disabled={locked}
                      onTest={() => void testDraft()}
                    />
                  ) : null}
                </div>
              </section>
              <section className="model-form-section model-detail-name">
                <div className="model-form-heading">
                  <label htmlFor="model-service-display-name">{uiText("显示名称")}</label>
                  <p>{uiText("用于在服务列表中识别此连接。")}</p>
                </div>
                <div className="model-form-fields">
                  <Input
                    id="model-service-display-name"
                    aria-label={uiText("显示名称")}
                    value={draft.provider.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    placeholder={uiText("给这个服务起个名字")}
                  />
                </div>
              </section>
              {image && !codex && !official ? (
                <details className="model-advanced">
                  <summary>
                    {uiText("高级设置")}
                    <ChevronDown />
                  </summary>
                  <div className="model-advanced-fields">
                    {image.type === "openai-compatible" ? (
                      <Field label={uiText("API 模式")}>
                        <Select
                          value={image.apiMode || "responses"}
                          onValueChange={(value) => {
                            const mode = value as "images" | "responses";
                            const previous = MODE_DEFAULTS[image.apiMode || "responses"];
                            patch({
                              apiMode: mode,
                              generationEndpoint:
                                image.generationEndpoint === previous.generationEndpoint
                                  ? MODE_DEFAULTS[mode].generationEndpoint
                                  : image.generationEndpoint,
                              referenceEndpoint:
                                image.referenceEndpoint === previous.referenceEndpoint
                                  ? MODE_DEFAULTS[mode].referenceEndpoint
                                  : image.referenceEndpoint,
                              compatResponseFormat:
                                mode === "responses" ? undefined : image.compatResponseFormat
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="responses">Responses</SelectItem>
                            <SelectItem value="images">Images</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    ) : null}
                    {image.type !== "fal" ? (
                      <>
                        <Field label={uiText("生成接口路径")}>
                          <Input
                            value={image.generationEndpoint}
                            onChange={(event) => patch({ generationEndpoint: event.target.value })}
                          />
                        </Field>
                        <Field label={uiText("编辑接口路径")}>
                          <Input
                            value={image.referenceEndpoint || ""}
                            onChange={(event) => patch({ referenceEndpoint: event.target.value })}
                          />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field label={uiText("编辑模型")}>
                          <FalModelCombobox
                            value={image.referenceModel || ""}
                            category="image-to-image"
                            placeholder={uiText("选择编辑模型")}
                            disabled={locked}
                            portalContainer={portalContainer}
                            providerId={image.id}
                            apiKeyOverride={draft.key.trim() || undefined}
                            onChange={(referenceModel) => patch({ referenceModel })}
                          />
                        </Field>
                        <Field label={uiText("尺寸参数")}>
                          <Select
                            value={image.falSizeMode || "aspect_ratio_and_resolution"}
                            onValueChange={(value) =>
                              patch({
                                falSizeMode: value as ProviderConfig["falSizeMode"]
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="image_size">image_size</SelectItem>
                              <SelectItem value="aspect_ratio">aspect_ratio</SelectItem>
                              <SelectItem value="aspect_ratio_and_resolution">
                                aspect_ratio + resolution
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={uiText("参考图参数")}>
                          <Select
                            value={image.falReferenceInput || "image_urls"}
                            onValueChange={(value) =>
                              patch({
                                falReferenceInput: value as ProviderConfig["falReferenceInput"]
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="image_urls">image_urls</SelectItem>
                              <SelectItem value="image_url">image_url</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </>
                    )}
                    <label className="model-switch-field">
                      <span>{uiText("支持参考图与图片编辑")}</span>
                      <Switch
                        checked={image.supportsReferenceImages}
                        onCheckedChange={(value) => patch({ supportsReferenceImages: value })}
                      />
                    </label>
                    {image.type === "openai-compatible" && image.apiMode === "images" ? (
                      <label className="model-switch-field">
                        <span>{uiText("发送兼容格式 response_format=b64_json")}</span>
                        <Switch
                          checked={image.compatResponseFormat === "b64_json"}
                          onCheckedChange={(value) =>
                            patch({
                              compatResponseFormat: value ? "b64_json" : undefined
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </fieldset>
            <aside className="model-detail-aside">
              <h3>{uiText("关于此连接")}</h3>
              <dl>
                <div><dt>{uiText("平台")}</dt><dd>{uiText(PLATFORM_LABELS[draft.provider.type])}</dd></div>
                <div><dt>{uiText("用途")}</dt><dd>{uiText(KIND_LABELS[draft.kind])}</dd></div>
                <div><dt>{uiText("授权方式")}</dt><dd>{codex ? uiText("ChatGPT 账号") : official ? uiText("平台管理") : "API Key"}</dd></div>
              </dl>
                      {text &&
                      snapshot.providers.some((provider) => provider.id === connectionOwnerId(draft)) ? (
                        <p className="model-field-note">
                          {uiText("与图片服务“{{ui:0}}”共用登录，账号操作会影响关联服务。", [
                            snapshot.providers.find((provider) => provider.id === connectionOwnerId(draft))
                              ?.name || ""
                          ])}
                        </p>
                      ) : null}
                      {image &&
                      snapshot.textProviders.some(
                        (provider) =>
                          provider.type === "codex-oauth" &&
                          (provider.authProviderId || provider.id) === image.id
                      ) ? (
                        <p className="model-field-note">
                          {uiText("此账号也用于关联的文本模型，账号操作会同步生效。")}
                        </p>
                      ) : null}

              <p className="model-local-note">
                <ShieldCheck />
                {uiText("凭据保存在本机，服务配置不随画板分享。")}
              </p>
            </aside>
          </div>
        ) : null}
      </div>
      <Dialog
        open={Boolean(pendingLeave)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingLeave(null);
        }}
      >
        <DialogContent
          className="settings-aux-dialog max-w-[420px]"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogTitle>{uiText("保存更改？")}</DialogTitle>
          <DialogDescription>{uiText("服务配置尚未保存，离开前可以保存或放弃本次修改。")}</DialogDescription>
          <div className="model-confirm-actions">
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setPendingLeave(null)}>
              {uiText("继续编辑")}
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => {
                const action = pendingLeave;
                setPendingLeave(null);
                action?.();
              }}
            >
              {uiText("放弃更改")}
            </Button>
            <Button disabled={Boolean(busy)} onClick={() => void saveDraft(pendingLeave || undefined)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {uiText("保存")}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent className="settings-aux-dialog max-w-[440px]">
          <DialogTitle>{uiText("删除服务？")}</DialogTitle>
          <DialogDescription>
            {deleteReferences.length
              ? uiText(
                  "删除后，以下视频服务将自动解除绑定，保留模型并改为独立连接，继续使用原服务地址和已保存的密钥。"
                )
              : linkedAccount
                ? uiText("删除此文本服务将自动解除与图片账号的绑定，不影响图片服务和账号登录。")
                : uiText("将移除 {{ui:0}}；如果它是默认服务，将改用其他可用连接。", [
                    deleting?.provider.name || ""
                  ])}
          </DialogDescription>
          {deleting?.kind === "image" && deleting.provider.type === "codex-oauth" ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {uiText("关联文本模型将保留，并继续使用已登录的账号。")}
            </p>
          ) : null}
          {deleteReferences.map((provider) => (
            <p key={provider.id} className="text-sm">
              {provider.name}
            </p>
          ))}
          <div className="model-confirm-actions">
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setDeleting(null)}>
              {uiText("取消")}
            </Button>
            <Button variant="destructive" disabled={locked} onClick={() => void confirmDelete()}>
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {uiText("删除服务")}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DefaultModelRow({
  kind,
  snapshot,
  keys,
  accounts,
  disabled,
  saving,
  portalContainer,
  onSelect,
  onConnect,
  onEdit
}: {
  kind: ModelKind;
  snapshot: ModelSettingsSnapshot;
  keys: Record<string, boolean>;
  accounts: Record<string, CodexAuthStatus>;
  disabled: boolean;
  saving: boolean;
  portalContainer: HTMLElement | null;
  onSelect: (choice: ModelChoice) => Promise<void>;
  onConnect: () => void;
  onEdit: (service: ModelService) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const choices = modelChoices(snapshot, kind);
  const activeId =
    kind === "image"
      ? snapshot.activeProviderId
      : kind === "text"
        ? snapshot.activeTextProviderId
        : snapshot.activeVideoProviderId;
  const current = choices.find(
    (choice) => choice.provider.id === activeId && choice.provider.model === choice.model
  );
  const currentState = current ? connectionState(current, snapshot, keys, accounts) : null;
  const filtered = choices.filter((choice) =>
    `${choice.provider.name} ${choice.model}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <div className="model-default-row">
      <div className="model-default-label">
        <h4>{uiText(KIND_LABELS[kind])}</h4>
        <p>
          {uiText(
            kind === "image"
              ? "生成、编辑与参考图"
              : kind === "text"
                ? "对话、提示词与图片分析"
                : "生成、续写与重混"
          )}
        </p>
      </div>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn("model-default-select", currentState?.ready && "model-default-select--set")}
            disabled={disabled}
            aria-label={uiText("选择{{ui:0}}", [uiText(KIND_LABELS[kind])])}
          >
            {current && currentState?.ready ? (
              <>
                <span>
                  <strong title={current.model}>{current.model || uiText("平台默认模型")}</strong>
                  <span>{current.provider.name}</span>
                </span>
              </>
            ) : (
              <span className="model-default-placeholder">
                {uiText(currentState ? REASONS[currentState.reason] : "选择模型")}
              </span>
            )}
            {saving ? (
              <Loader2 className="model-select-chevron animate-spin" />
            ) : (
              <ChevronDown className="model-select-chevron" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          portalContainer={portalContainer}
          align="end"
          className="model-route-popover w-[350px] max-w-[calc(100vw-40px)] p-0"
        >
          <div className="model-route-search">
            <Search />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={uiText("搜索模型或服务")}
              aria-label={uiText("搜索模型或服务")}
            />
          </div>
          <div className="model-route-options" role="group" aria-label={uiText("可选模型")}>
            {filtered.map((choice, index) => {
              const state = connectionState(choice, snapshot, keys, accounts);
              const selected = current?.provider.id === choice.provider.id && current.model === choice.model;
              const groupStart = index === 0 || filtered[index - 1].provider.id !== choice.provider.id;
              return (
                <div key={`${choice.provider.id}:${choice.model}`}>
                  {groupStart ? (
                    <div className="model-route-group">
                      <PlatformMark type={choice.provider.type} small />
                      <span>{choice.provider.name}</span>
                      {!state.ready ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onEdit(choice);
                          }}
                        >
                          {uiText("配置")}
                          <ArrowRight />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={!state.ready}
                    aria-pressed={selected}
                    className="model-route-option"
                    onClick={() => {
                      setOpen(false);
                      void onSelect(choice);
                    }}
                  >
                    <span>
                      <strong>{choice.model || uiText("平台默认模型")}</strong>
                      {!state.ready ? <span>{uiText(REASONS[state.reason])}</span> : null}
                    </span>
                    {selected ? <Check /> : null}
                  </button>
                </div>
              );
            })}
            {!filtered.length ? (
              <p className="model-route-empty">
                {uiText(choices.length ? "没有找到匹配的模型" : "连接服务后即可选择模型")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="model-route-add"
            onClick={() => {
              setOpen(false);
              onConnect();
            }}
          >
            <Plus />
            {uiText("添加服务")}
            <ArrowRight />
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AccountConnection({
  status,
  action,
  onAction
}: {
  status: CodexAuthStatus;
  action: "sign-in" | "refresh" | "sign-out" | null;
  onAction: (action: "sign-in" | "refresh" | "sign-out") => Promise<void>;
}): React.ReactElement {
  const uiText = useUiText();
  const connected = status.state === "connected" || status.state === "refreshing";
  const needsLogin = status.state === "expired" || status.state === "reauth-required";
  return (
    <div className="model-account-connection">
      <div className="model-account-identity">
        <span className="model-account-avatar">
          {action ? <Loader2 className="animate-spin" /> : <UserRound />}
        </span>
        <div>
          <strong>
            {status.email ||
              uiText(action === "sign-in" ? "等待浏览器授权" : needsLogin ? "登录已过期" : "ChatGPT 账号")}
          </strong>
          <p>
            {uiText(
              action === "sign-in"
                ? "请在浏览器中完成登录。"
                : connected
                  ? "账号已登录"
                  : needsLogin
                    ? "请重新登录以恢复账号授权。"
                    : "通过浏览器登录，无需填写 API Key。"
            )}
            {connected && status.planType ? ` · ${status.planType}` : ""}
          </p>
        </div>
      </div>
      <div className="model-account-actions">
        {connected ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="model-service-actions"
                aria-label={uiText("账号操作")}
                disabled={Boolean(action)}
              >
                <MoreHorizontal />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="model-service-menu">
              <DropdownMenuItem onSelect={() => void onAction("refresh")}>
                <RefreshCw />
                {uiText("刷新登录状态")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onAction("sign-out")}>
                <LogOut />
                {uiText("退出账号")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button type="button" size="sm" disabled={Boolean(action)} onClick={() => void onAction("sign-in")}>
            <LogIn />
            {uiText(action === "sign-in" ? "等待授权…" : needsLogin ? "重新登录" : "登录账号")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectionVerification({
  result,
  testing,
  configured,
  disabled,
  onTest
}: {
  result: TestResult | null;
  testing: boolean;
  configured: boolean;
  disabled: boolean;
  onTest: () => void;
}): React.ReactElement {
  const uiText = useUiText();
  return (
    <div className={cn("model-connection-check", result?.ok === false && "model-connection-check--error")}>
      <div className="model-connection-check-copy" role="status">
        <span className={cn("model-verification-label", result?.ok && "model-verification-label--success")}>
          {testing ? (
            <Loader2 className="animate-spin" />
          ) : result ? (
            result.ok ? (
              <CheckCircle2 />
            ) : (
              <XCircle />
            )
          ) : null}
          {uiText(
            testing ? "正在验证连接…" : result ? (result.ok ? "连接已验证" : "验证未通过") : "尚未验证连接"
          )}
        </span>
        {result ? (
          <p>
            {result.message}
            {result.checkedAt ? (
              <span className="model-check-time">
                {uiText("检查于 {{ui:0}}", [
                  new Date(result.checkedAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                ])}
              </span>
            ) : null}
          </p>
        ) : !configured ? (
          <p>{uiText("填写连接信息并选择模型后，可验证连接。")}</p>
        ) : null}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || !configured} onClick={onTest}>
        {uiText(testing ? "验证中…" : "验证连接")}
      </Button>
    </div>
  );
}
