import { useUiText } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Download, FileText, Film, Image as ImageIcon, LayoutGrid, List, MessageSquare, Mic, Monitor, MoreHorizontal, Plus, Search, Settings2, Sparkles, Square, UserRound, Users, X } from "lucide-react";
import { createRoot } from "react-dom/client";
import { iterlay, usePluginContext } from "../../../packages/plugin-sdk/src";
import type { ComicDramaBoardNode, ComicDramaBoardSnapshot } from "../../../shared/comic-drama";
import type { SceneAssistantInteraction } from "../../../shared/contracts/assistant";
import { createNode, fields, savePlan, stages, type Stage } from "./model";

const DEFAULT_DIRECTOR_NOTES = "保持角色外观一致；每次只推进当前制作阶段。";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };
type ScriptDraft = { versionId: string; values: Record<string, string> };
type SavedState = { scriptDrafts?: Record<string, ScriptDraft>; stage: Stage; layout?: "grid" | "list"; messages: Message[]; conversationId: string; draft: string; editorDraft?: { node: ComicDramaBoardNode; values: Record<string, string> } };
const empty: ComicDramaBoardSnapshot = { boardId: "", revision: 0, nodes: [], connections: [], groups: [] };
const labels: Record<string, string> = { title: "标题", synopsis: "故事梗概", genre: "题材", tone: "叙事基调", worldRules: "世界规则（每行一条）", visualStyle: "统一视觉风格", aspectRatio: "画面比例", targetDurationSeconds: "目标时长 / 秒", name: "角色名称", role: "故事定位", profile: "背景、性格与动机", appearanceAnchors: "固定外观锚点（每行一条）", visualPrompt: "角色形象提示词", purpose: "叙事目的", scene: "场景", action: "画面与动作", dialogue: "台词 / 旁白", emotion: "情绪", visualDirection: "画面提示词", cameraDirection: "运镜", durationSeconds: "镜头时长 / 秒" };
const statusLabels: Record<string, string> = { draft: "草稿", saved: "已保存", ready: "就绪", adopted: "已采用", generating: "生成中", failed: "失败", stale: "待更新", blocked: "需处理", review: "待确认" };
function initialValues(node: ComicDramaBoardNode) {
  const data = fields(node)!;
  return Object.fromEntries(Object.entries({ ...data, ...(node.type === "comic-character" ? { name: node.name } : node.type === "comic-segment-script" ? { title: node.title } : {}) }).filter(([key]) => key !== "constraints").map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : String(value)]));
}
function Editor({ node, snapshot, busy, draft, onDraft, onSave, onCancel }: { node: ComicDramaBoardNode; snapshot: ComicDramaBoardSnapshot; busy: boolean; draft?: Record<string, string>; onDraft: (values: Record<string, string>) => void; onSave: () => Promise<void>; onCancel: () => void }) {
  const uiText = useUiText();
  const [values, setValues] = useState(() => draft ?? initialValues(node));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const keys = node.type === "comic-setting" ? ["title", "synopsis", "genre", "tone", "visualStyle", "worldRules", "aspectRatio", "targetDurationSeconds"] : node.type === "comic-character" ? ["name", "role", "profile", "appearanceAnchors", "visualPrompt"] : ["title", "purpose", "scene", "action", "dialogue", "emotion", "visualDirection", "cameraDirection", "durationSeconds"];
  return <form className="editor" onSubmit={async event => {
    event.preventDefault(); if (saving || busy) return; setError(""); setSaving(true);
    try {
      const fresh = await iterlay.board.snapshot<ComicDramaBoardSnapshot>();
      const current = fresh.nodes.find(n => n.id === node.id);
      if (current && "activeVersionId" in current && current.activeVersionId !== node.activeVersionId) throw new Error(uiText("该内容已在画板更新。请收起后重新打开，避免覆盖新版本；当前草稿已保留。"));
      await iterlay.board.applyPlan(savePlan(fresh, node, values)); await onSave();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setSaving(false); }
  }}><div className="section-heading"><h2>{snapshot.nodes.some(n => n.id === node.id) ? uiText("编辑") : uiText("新建")}{node.type === "comic-setting" ? uiText("故事设定") : node.type === "comic-character" ? uiText("角色") : uiText("分镜")}</h2><button type="button" className="text-button" disabled={busy} onClick={onCancel}>{uiText("关闭编辑")}</button></div>
    <p className="muted">{uiText("保存为新版本；保留旧版本，不会自动产生媒体费用。")}</p>
    {keys.map(key => <label key={key}>{uiText(labels[key])}{["synopsis", "profile", "visualPrompt", "appearanceAnchors", "worldRules", "action", "dialogue", "visualDirection"].includes(key) ? <textarea rows={key === "synopsis" ? 5 : 3} value={values[key] ?? ""} onChange={e => { const next = { ...values, [key]: e.target.value }; setValues(next); onDraft(next); }} /> : key === "aspectRatio" ? <select value={values[key]} onChange={e => { const next = { ...values, [key]: e.target.value }; setValues(next); onDraft(next); }}><option>9:16</option><option>16:9</option><option>1:1</option><option>4:3</option></select> : <input type={key.includes("Seconds") ? "number" : "text"} min={1} max={key === "durationSeconds" ? 120 : 3600} value={values[key] ?? ""} onChange={e => { const next = { ...values, [key]: e.target.value }; setValues(next); onDraft(next); }} />}</label>)}
    {error && <p role="alert" className="error">{uiText(error)}</p>}<button className="primary full" disabled={busy || saving}>{saving ? uiText("正在保存…") : uiText("保存更改")}</button>
  </form>;
}
function Interaction({ item, onDone }: { item: { id: string; interaction: SceneAssistantInteraction }; onDone: () => void }) {
  const uiText = useUiText();
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function respond(action: "submit" | "dismiss") {
    setPending(true);
    try { await iterlay.assistant.respond(item.id, action, values); onDone(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setPending(false); }
  }
  return <form className="interaction" onSubmit={e => { e.preventDefault(); void respond("submit"); }}><strong>{item.interaction.title}</strong><p>{item.interaction.description}</p>{item.interaction.type === "form" && item.interaction.fields.map(f => <label key={f.id}>{f.label}{f.type === "select" ? <select required={f.required} multiple={f.multiple} value={values[f.id] ?? (f.multiple ? [] : "")} onChange={e => setValues(v => ({ ...v, [f.id]: f.multiple ? Array.from(e.target.selectedOptions, o => o.value) : e.target.value }))}>{!f.multiple && <option value="">{uiText("请选择")}</option>}{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : f.type === "textarea" ? <textarea required={f.required} placeholder={f.placeholder} value={String(values[f.id] ?? "")} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))} /> : <input required={f.required} placeholder={f.placeholder} value={String(values[f.id] ?? "")} onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))} />}</label>)}{error && <p className="error">{uiText(error)}</p>}<div className="actions"><button type="button" disabled={pending} onClick={() => void respond("dismiss")}>{uiText("取消")}</button><button className="primary" disabled={pending}>{uiText("确认继续")}</button></div></form>;
}
function ScriptPanel({ shots, drafts, busy, onDrafts, onSaved }: {
  shots: Extract<ComicDramaBoardNode, { type: "comic-segment-script" }>[];
  drafts: Record<string, ScriptDraft>;
  busy: boolean;
  onDrafts: (drafts: Record<string, ScriptDraft>) => void;
  onSaved: () => Promise<void>;
}) {
  const uiText = useUiText();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy || saving) return;
    setSaving(true); setError("");
    const remaining = { ...drafts };
    try {
      for (const [id, draft] of Object.entries(drafts)) {
        const fresh = await iterlay.board.snapshot<ComicDramaBoardSnapshot>();
        const node = fresh.nodes.find((n): n is Extract<ComicDramaBoardNode, { type: "comic-segment-script" }> => n.id === id && n.type === "comic-segment-script");
        if (!node) throw new Error(uiText("镜头已被移除，当前剧本草稿仍然保留。"));
        if (node.activeVersionId !== draft.versionId) throw new Error(uiText("镜头 {{ui:0}} 已更新，请先检查新版本。当前草稿仍然保留。", [node.order]));
        await iterlay.board.applyPlan(savePlan(fresh, node, draft.values));
        delete remaining[id];
        onDrafts({ ...remaining });
      }
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  }
  return <section className="script-panel" aria-label={uiText("剧本编辑区")}>
    <div className="script-paper">{shots.length ? shots.map(node => {
      const values = drafts[node.id]?.values ?? initialValues(node);
      const update = (key: string, value: string) => onDrafts({ ...drafts, [node.id]: { versionId: drafts[node.id]?.versionId ?? node.activeVersionId, values: { ...values, [key]: value } } });
      return <div className="script-line" key={node.id}>
        <span className="script-line-number">{node.order}</span>
        <div className="script-block">{["scene", "action", "cameraDirection", "dialogue"].map(key => <textarea key={key} aria-label={uiText("镜头 {{ui:0}} {{ui:1}}", [node.order, labels[key]])} className={`script-${key}`} rows={1} ref={element => { if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; } }} value={values[key] ?? ""} placeholder={key === "scene" ? uiText("镜头 {{ui:0}} · 场景", [node.order]) : key === "action" ? uiText("画面动作") : key === "cameraDirection" ? uiText("运镜") : uiText("对白 / 旁白")} onChange={e => update(key,e.target.value)} />)}</div>
      </div>;
    }) : <p className="script-empty">{uiText("添加分镜后，在这里逐镜编辑剧本。")}</p>}</div>
    {error && <p className="error script-error" role="alert">{uiText(error)}</p>}
    <footer className="script-save"><button disabled={saving || busy || !Object.keys(drafts).length} onClick={() => onDrafts({})}>{uiText("取消")}</button><button className="script-save-button" disabled={saving || busy || !Object.keys(drafts).length} onClick={() => void save()}>{saving ? uiText("保存中…") : uiText("保存剧本")}</button></footer>
  </section>;
}
function App() {
  const uiText = useUiText();
  const context = usePluginContext();
  const [snapshot, setSnapshot] = useState(empty);
  const [stage, setStage] = useState<Stage>("shots");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [activity, setActivity] = useState("");
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("script");
  const [columns, setColumns] = useState(4);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [scriptDrafts, setScriptDrafts] = useState<Record<string, ScriptDraft>>({});
  const projectMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPresenting(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ComicDramaBoardNode | null>(null);
  const [editorDraft, setEditorDraft] = useState<SavedState["editorDraft"]>();
  const [interaction, setInteraction] = useState<{ id: string; interaction: SceneAssistantInteraction } | null>(null);
  const [settings, setSettings] = useState({ directorNotes: DEFAULT_DIRECTOR_NOTES, defaultDuration: 6 });
  const [settingsMessage, setSettingsMessage] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const state = useRef<SavedState>({ stage, messages, draft, conversationId });
  state.current = { stage, layout, messages, draft, conversationId, editorDraft, scriptDrafts };
  const refresh = useCallback(async () => {
    setSnapshot(await iterlay.board.snapshot<ComicDramaBoardSnapshot>());
    void iterlay.board.previews().then(setPreviews).catch(() => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([iterlay.storage.get<SavedState>("board"), iterlay.storage.get<typeof settings>("settings"), iterlay.board.snapshot<ComicDramaBoardSnapshot>()]).then(([saved, config, board]) => {
      if (!live) return;
      setSnapshot(board);
      if (saved) { if (saved.scriptDrafts) setScriptDrafts(saved.scriptDrafts); if (saved.layout === "list") { setLayout("list"); setView("tool"); } if (stages.some(s => s.id === saved.stage)) setStage(saved.stage); setMessages(saved.messages ?? []); setDraft(saved.draft ?? ""); if (saved.conversationId) setConversationId(saved.conversationId); if (saved.editorDraft) { setEditorDraft(saved.editorDraft); setEditor(saved.editorDraft.node); } }
      if (config) setSettings(config);
      void iterlay.board.previews().then(value => { if (live) setPreviews(value); }).catch(() => undefined);
      setLoaded(true);
    }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { live = false; };
    // A new frame is mounted for each board and settings view.
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const value = state.current;
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => iterlay.storage.set("board", value)).then(() => setSaveError(""), reason => setSaveError(String(reason)));
  }, [stage, layout, messages, draft, conversationId, editorDraft, scriptDrafts, loaded]);
  useEffect(() => iterlay.onEvent(message => {
    if (message.type === "view" && message.view !== "tool") setView(String(message.view));
    if (message.type === "context") { const c = message.context as { theme: string }; document.documentElement.dataset.theme = c.theme; if (message.view && message.view !== "tool") setView(String(message.view)); }
    if (message.type === "board-changed") void refresh().catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
    if (message.type !== "assistant") return;
    const e = message.event as { type: string; delta?: string; label?: string; id?: string; interaction?: SceneAssistantInteraction; message?: string; result?: { message: string; interaction?: SceneAssistantInteraction } };
    if (e.type === "delta") { setActivity(""); setMessages(current => current.map((m, i) => i === current.length - 1 ? { ...m, content: m.content + e.delta } : m)); }
    if (e.type === "activity") setActivity(e.label ?? uiText("处理中"));
    if (e.type === "interaction" && e.interaction && e.id) { setActivity(""); setShowChat(true); setInteraction({ id: e.id, interaction: e.interaction }); }
    if (["result", "error", "cancelled"].includes(e.type)) {
      setRunning(false); setActivity(""); setInteraction(null);
      setMessages(current => current.map((m, i) => i === current.length - 1 ? { ...m, content: e.result?.message || e.message || m.content || uiText("已停止。"), error: e.type === "error" } : m));
    }
    if (e.type === "warning") setError(e.message ?? uiText("画板刷新失败"));
  }), [refresh, uiText]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, activity, interaction]);
  const setting = snapshot.nodes.find(n => n.type === "comic-setting");
  const characters = snapshot.nodes.filter(n => n.type === "comic-character");
  const shots = snapshot.nodes.filter(n => n.type === "comic-segment-script").sort((a, b) => a.order - b.order);
  const title = setting ? (fields(setting) as { title: string }).title : "";
  const stageCopy = { story: { title: uiText("先把故事讲清楚"), description: uiText("确定主角、目标和冲突，让后续每个镜头都有依据。"), cta: uiText("整理故事设定"), prompt: uiText("根据我当前的故事设定，完善主角、目标、核心冲突与视觉风格，保存设定。只处理故事，不创建角色或分镜。") }, characters: { title: uiText("让每个角色都能被认出"), description: uiText("固定人物动机、外观与服装，建立可复用的角色资产。"), cta: uiText("规划角色阵容"), prompt: uiText("根据已保存故事规划必要角色，补齐动机、外观锚点与视觉提示词，只创建角色卡，不生成媒体，不创建分镜。") }, shots: { title: uiText("把故事拆成可拍的镜头"), description: uiText("每个分镜明确画面、台词、运镜和时长，逐镜打磨。"), cta: uiText("创作下一个分镜"), prompt: uiText("阅读当前设定、角色与已有分镜，创建下一个连续分镜，默认约 {{ui:0}} 秒，包含动作、台词和运镜。只创建一个分镜，不生成媒体。", [settings.defaultDuration]) }, production: { title: uiText("从分镜到动态画面"), description: uiText("选定分镜，建立首尾帧和视频链。媒体生成前逐项确认。"), cta: uiText("建立所选分镜制作链"), prompt: uiText("为当前选中的分镜建立首帧、尾帧与视频节点，保持角色与场景连续。只创建节点，不调用媒体生成。") } };
  async function run(instruction: string) {
    if (!instruction.trim() || running || !loaded) return;
    setShowChat(true); setError(""); setRunning(true); setActivity(uiText("正在读取制作上下文…"));
    const conversation = messages.filter(m => m.content && !m.error).slice(-16).map(({ role, content }) => ({ role, content }));
    setMessages(m => [...m, { role: "user", content: instruction }, { role: "assistant", content: "" }]);
    setDraft("");
    try { await iterlay.assistant.start(uiText("{{ui:0}}\n\n当前制作阶段：{{ui:1}}。除非用户明确要求跨阶段，否则只推进当前阶段。\n导演约定：{{ui:2}}", [instruction, stages.find(s => s.id === stage)?.label, settings.directorNotes]), conversation, conversationId); }
    catch (reason) { setRunning(false); setActivity(""); setMessages(m => m.map((item, i) => i === m.length - 1 ? { ...item, content: String(reason), error: true } : item)); }
  }
  async function startEdit(node: ComicDramaBoardNode) {
    setView("tool"); setShowChat(false); setSelectedId(node.id); setEditor(node); setEditorDraft(current => current?.node.id === node.id ? current : undefined);
    if (snapshot.nodes.some(n => n.id === node.id)) await iterlay.board.select([node.id]);
  }
  if (!context || !loaded) return <div className="loading" role={error ? "alert" : "status"}>{error || uiText("正在恢复制作进度…")}{error && <div className="actions"><button onClick={() => window.location.reload()}>{uiText("重新加载")}</button><button onClick={() => void iterlay.workspace.back()}>{uiText("返回主画板")}</button></div>}</div>;
  const totalDuration = shots.reduce((sum, shot) => sum + (fields(shot) as { durationSeconds: number }).durationSeconds, 0);
  const selectedNode = snapshot.nodes.find((n): n is ComicDramaBoardNode => n.id === selectedId && n.type !== "video-sequence-entry");
  const visibleShots = shots.filter(n => `${n.title} ${JSON.stringify(fields(n))}`.toLowerCase().includes(search.toLowerCase()));
  const visibleCharacters = characters.filter(n => `${n.name} ${JSON.stringify(fields(n))}`.toLowerCase().includes(search.toLowerCase()));
  const stageLabels = { story: uiText("故事与剧本"), characters: uiText("角色资产"), shots: uiText("分镜"), production: uiText("镜头制作") };
  const stageIcons = { story: FileText, characters: Users, shots: Film, production: Clapperboard };
  const handleError = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason));
  const selectNode = (node: ComicDramaBoardNode) => {
    setView("tool"); setShowChat(false); setEditor(null); setSelectedId(node.id);
    void iterlay.board.select([node.id]).catch(handleError);
  };
  const changeStage = (next: Stage) => { setStage(next); setSearch(""); setView(next === "shots" ? "script" : "tool"); setShowChat(false); setEditor(null); setSelectedId(null); if (projectMenu.current) projectMenu.current.open = false; };
  async function generateFor(node: ComicDramaBoardNode) {
    if (running) return;
    selectNode(node);
    setEditor(null);
    const subject = node.type === "comic-character" ? uiText("生成角色「{{ui:0}}」的形象图，目标角色 ID：{{ui:1}}", [node.name, node.id])
      : uiText("为分镜「{{ui:0}}」生成首帧，目标分镜 ID：{{ui:1}}。缺少首帧生成节点时先建立当前分镜的媒体链", [node.type === "comic-segment-script" ? node.title : "", node.id]);
    await run(uiText("{{ui:0}}。只处理这个对象。先读取实时状态，保持角色与场景一致，通过 quote_comic_media、confirm_comic_media、generate_comic_media 逐项确认后再生成，不得跳过费用确认。", [subject]));
  }
  const createItem = () => {
    const type = stage === "story" ? "comic-setting" : stage === "characters" ? "comic-character" : "comic-segment-script";
    void startEdit(stage === "story" && setting ? setting : createNode(type, snapshot)).catch(handleError);
  };
  const canAdd = !running && (stage === "story" || !!setting);
  const panelOpen = !presenting && (!!editor || showChat || view === "settings" || (stage === "shots" && view === "script") || !!selectedNode);
  const panelClose = () => { setShowChat(false); setEditor(null); setSelectedId(null); setView("tool"); };
  const emptyState = (Icon: typeof Film, heading: string, description: string) => <div className="empty-state"><Icon size={34} strokeWidth={1.3} /><h2>{heading}</h2><p>{description}</p><button className="primary" disabled={!canAdd} onClick={createItem}><Plus size={15} />{stage === "story" ? uiText("编写故事设定") : stage === "characters" ? uiText("添加角色") : uiText("添加分镜")}</button><button className="text-button" disabled={running} onClick={() => void run(stageCopy[stage].prompt)}><Sparkles size={14} />{uiText("让 AI 帮我开始")}</button></div>;
  return <main className={`studio ${panelOpen ? "with-side-panel" : ""} ${presenting ? "is-presenting" : ""}`} style={{ "--frame-columns": columns } as React.CSSProperties}>
    <header className="studio-header">
      <div className="project-identity"><div className="project-breadcrumb"><button className="back-button icon-button" aria-label={uiText("返回主画板")} onClick={() => void iterlay.workspace.back().catch(handleError)}><ChevronLeft size={16} /></button><span>Iterlay</span><span>/</span><details ref={projectMenu} className="project-menu"><summary aria-label={uiText("项目功能")}>{uiText("短剧项目")}<ChevronDown size={12} /></summary><nav className="studio-navigation" aria-label={uiText("制作阶段")}>{stages.map(item => { const Icon = stageIcons[item.id]; return <button key={item.id} aria-label={`${item.number} ${uiText(item.label)}`} aria-current={stage === item.id ? "page" : undefined} onClick={() => changeStage(item.id)}><Icon size={15} />{stageLabels[item.id]}</button>; })}<button aria-label={uiText("插件市场")} onClick={() => void iterlay.workspace.manage().catch(handleError)}><MoreHorizontal size={15} />{uiText("插件管理")}</button></nav></details></div><div className="project-title-row"><h1>{title && title !== "未命名漫剧" ? title : uiText("未命名项目")}</h1><span className="version-pill">v{setting?.versions.length ?? 1}<ChevronDown size={11} /></span><span className="word-count">{shots.reduce((count,node) => count + Object.values(fields(node)!).filter(v => typeof v === "string").join("").length,0)} {uiText("字")}</span></div></div>
      <div className="header-actions"><button className="icon-button" aria-label={uiText("导出项目")} title={uiText("导出项目")} onClick={() => void iterlay.workspace.export().catch(handleError)}><Download size={19} /></button><button className="icon-button" aria-label={uiText("演示分镜")} title={uiText("演示分镜")} disabled={!shots.length} onClick={() => { setStage("shots"); setLayout("grid"); setSearch(""); setPresentIndex(0); setPresenting(true); }}><Monitor size={19} /></button><button aria-label={uiText("AI 导演")} className={showChat ? "active-button" : "director-button"} onClick={() => { setShowChat(v => !v); setEditor(null); setSelectedId(null); setView("tool"); }}><MessageSquare size={16} /><span>{uiText("AI 导演")}</span>{running && <span className="busy-dot" />}</button><button className="project-avatar" aria-label={view === "settings" ? uiText("返回工具") : uiText("工具设置")} title={uiText("工具设置")} onClick={() => { setView(v => v === "settings" ? "script" : "settings"); setShowChat(false); setEditor(null); setSelectedId(null); }}>I</button></div>
    </header>
    {panelOpen && <div className="side-panel-tabs" role="toolbar" aria-label={uiText("侧栏工具")}><button className="icon-button" aria-label={uiText("AI 导演面板")} aria-pressed={showChat} onClick={() => { setShowChat(true); setEditor(null); setSelectedId(null); setView("tool"); }}><MessageSquare size={19} /></button><button className="icon-button" aria-label={uiText("剧本面板")} aria-pressed={view === "script" && !showChat && !editor} onClick={() => { setShowChat(false); setEditor(null); setSelectedId(null); setView("script"); setStage("shots"); }}><FileText size={19} /></button><button className="icon-button" aria-label={uiText("角色资产面板")} onClick={() => changeStage("characters")}><UserRound size={19} /></button><button className="icon-button" aria-label={uiText("偏好设置面板")} aria-pressed={view === "settings"} onClick={() => { setView("settings"); setShowChat(false); setEditor(null); setSelectedId(null); }}><Settings2 size={19} /></button><button className="icon-button" aria-label={uiText("关闭面板")} onClick={panelClose}><X size={18} /></button></div>}
    {presenting && <div className="presentation-controls"><button className="icon-button" aria-label={uiText("上一镜")} disabled={presentIndex === 0} onClick={() => setPresentIndex(i => i-1)}><ChevronLeft size={18} /></button><span>{presentIndex+1} / {shots.length}</span><button className="icon-button" aria-label={uiText("下一镜")} disabled={presentIndex >= shots.length-1} onClick={() => setPresentIndex(i => i+1)}><ChevronRight size={18} /></button><button onClick={() => setPresenting(false)}>{uiText("退出演示")}<X size={14} /></button></div>}
    {(error || saveError) && <div className="studio-alert" role="alert"><span>{error || uiText("草稿保存失败：{{ui:0}}", [saveError])}</span><button className="text-button" onClick={() => { setError(""); void refresh().catch(handleError); }}>{uiText("重新读取")}</button><button className="icon-button" aria-label={uiText("关闭提示")} onClick={() => setError("")}><X size={14} /></button></div>}
    <div className={`studio-body ${panelOpen ? "has-panel" : ""}`}>
      <section className="studio-main" aria-label={uiText(stageLabels[stage])}>
        <div className="content-toolbar">
          <div className="content-actions toolbar-views">
            <div className="view-switch" role="group" aria-label={uiText("分镜显示方式")}><button className="icon-button" aria-label={uiText("画面视图")} aria-pressed={stage === "shots" && layout === "grid" && columns === 1} onClick={() => { changeStage("shots"); setLayout("grid"); setColumns(1); }}><ImageIcon size={20} /></button><button className="icon-button" aria-label={uiText("网格视图")} aria-pressed={stage === "shots" && layout === "grid" && columns !== 1} onClick={() => { changeStage("shots"); setLayout("grid"); setColumns(4); }}><LayoutGrid size={20} /></button><button className="icon-button" aria-label={uiText("列表视图")} aria-pressed={stage === "shots" && layout === "list"} onClick={() => { changeStage("shots"); setLayout("list"); setView("tool"); }}><List size={21} /></button></div>
            <label className="density-control" hidden={stage !== "shots" || layout !== "grid"}><span>−</span><input aria-label={uiText("分镜缩放")} type="range" min="1" max="6" value={7-columns} onChange={e => setColumns(7-Number(e.target.value))} /><span>+</span></label>
          </div>
          <div className="content-actions toolbar-tools"><label className="search-field"><Search size={14} /><input aria-label={uiText("搜索制作内容")} placeholder={uiText("搜索")} value={search} onChange={e => setSearch(e.target.value)} /></label><button className="icon-button" disabled={!canAdd} aria-label={stage === "story" ? setting ? uiText("编辑故事") : uiText("编写故事设定") : stage === "characters" ? uiText("添加角色") : uiText("添加分镜")} title={uiText("添加内容")} onClick={createItem}><Plus size={18} /></button><button className="icon-button" aria-label={uiText("打开剧本")} title={uiText("剧本")} onClick={() => { changeStage("shots"); setView("script"); }}><FileText size={18} /></button><button className="icon-button" aria-label={uiText("展开编辑面板")} title={uiText("展开编辑面板")} onClick={() => { setView("script"); setShowChat(false); }}><ChevronRight size={18} /></button></div>
        </div>
        <div className="workspace-scroll">
          {editorDraft && !editor && <button className="resume-draft" onClick={() => { setEditor(editorDraft.node); setShowChat(false); setView("tool"); }}><FileText size={14} />{uiText("恢复未完成的编辑")}<ChevronRight size={14} /></button>}
          {stage === "story" && (setting ? <article className="script-document"><div className="document-heading"><FileText size={18} /><span>{uiText("故事设定")}</span><button className="text-button" disabled={running} onClick={() => void startEdit(setting).catch(handleError)}>{uiText("编辑设定")}<ChevronRight size={13} /></button></div><h2>{title && title !== "未命名漫剧" ? title : uiText("未命名故事")}</h2><p className="script-synopsis">{String((fields(setting) as { synopsis: string }).synopsis || uiText("添加故事梗概，确定主角、目标和冲突。"))}</p><dl className="story-properties">{[[uiText("题材"), (fields(setting) as { genre: string }).genre], [uiText("叙事基调"), (fields(setting) as { tone: string }).tone], [uiText("视觉风格"), (fields(setting) as { visualStyle: string }).visualStyle], [uiText("画面比例"), (fields(setting) as { aspectRatio: string }).aspectRatio], [uiText("目标时长"), uiText("{{ui:0}} 秒", [(fields(setting) as { targetDurationSeconds: number }).targetDurationSeconds])]].map(([label,value]) => <div key={uiText(label)}><dt>{label}</dt><dd>{value || uiText("未设置")}</dd></div>)}</dl><div className="document-footer"><span>{characters.length} {uiText("个角色 ·")}{shots.length} {uiText("个分镜")}</span><button disabled={running} onClick={() => void run(stageCopy.story.prompt)}><Sparkles size={14} />{uiText("完善故事设定")}</button></div></article> : emptyState(FileText, uiText("从故事开始"), uiText("写下故事梗概，或让 AI 帮你把灵感整理成剧本。")))}
          {stage === "characters" && (characters.length ? <div className="character-grid">{visibleCharacters.map(n => { const f = fields(n) as { role: string; profile: string; appearanceAnchors: string[] }; return <article key={n.id} className={`character-card ${selectedId === n.id ? "selected" : ""}`}><button className="character-cover" aria-label={uiText("查看角色 {{ui:0}}", [n.name])} onClick={() => selectNode(n)}>{previews[n.id] ? <img src={previews[n.id]} alt={n.name} /> : <><UserRound size={42} strokeWidth={1.1} /><span>{uiText("尚未生成角色形象")}</span></>}</button><div className="character-caption"><div><h3>{n.name}</h3><span className={`status status-${n.status}`}>{uiText(statusLabels[n.status] ?? n.status)}</span></div><p>{f.role || uiText("待补充故事定位")}</p><div className="character-tags">{f.appearanceAnchors.slice(0,3).map(anchor => <span key={anchor}>{anchor}</span>)}</div><footer><button className="text-button" disabled={running} onClick={() => void startEdit(n).catch(handleError)}>{uiText("编辑角色")}</button><button disabled={running} onClick={() => void generateFor(n)}><Sparkles size={13} />{uiText("生成形象")}</button></footer></div></article>; })}</div> : emptyState(Users, uiText("建立你的演员表"), setting ? uiText("固定人物的外观与动机，让角色贯穿每个镜头。") : uiText("先到故事页保存项目设定，再添加角色。")))}
          {stage === "shots" && (shots.length ? layout === "grid" ? <div className="storyboard-grid">{visibleShots.filter((_,i) => !presenting || i === presentIndex).map(n => { const f = fields(n) as { action: string; scene: string; durationSeconds: number; cameraDirection: string; dialogue: string }; return <article key={n.id} className={`frame-card ${selectedId === n.id ? "selected" : ""}`}>
            <button className="frame-image" aria-label={uiText("查看分镜 {{ui:0}}", [n.title])} onClick={() => selectNode(n)}>{previews[n.id] ? <img src={previews[n.id]} alt={n.title} /> : <><ImageIcon size={30} strokeWidth={1.1} /><span>{uiText("画面待生成")}</span></>}</button>
            <div className="frame-caption"><div className="frame-heading"><span>{n.order}</span><h3>{f.scene || n.title}</h3></div><div className="frame-script frame-action"><Clapperboard size={13} /><p>{f.action || uiText("添加画面动作")}</p></div><div className="frame-script"><UserRound size={13} /><p>{f.cameraDirection || uiText("运镜待定")}</p></div><div className="frame-script"><Mic size={13} /><p>{f.dialogue || uiText("暂无对白")}</p></div></div><footer><button className="text-button" disabled={running} onClick={() => void startEdit(n).catch(handleError)}>{uiText("编辑分镜")}</button><button className="text-button" disabled={running} onClick={() => void generateFor(n)}><Sparkles size={13} />{uiText("生成画面")}</button></footer>
          </article>; })}</div> : <div className="shot-table-wrap"><table className="shot-table"><thead><tr><th>{uiText("镜头")}</th><th>{uiText("画面")}</th><th>{uiText("标签")}</th><th>{uiText("旁白 / 声音")}</th><th>{uiText("动作")}</th><th>{uiText("备注")}</th><th>{uiText("状态")}</th></tr></thead><tbody>{visibleShots.map(n => { const f = fields(n) as { action: string; scene: string; durationSeconds: number; cameraDirection: string; dialogue: string }; return <tr key={n.id} className={selectedId === n.id ? "selected" : ""}><td>{String(n.order).padStart(2,"0")}</td><td><button className="table-preview" aria-label={uiText("查看分镜 {{ui:0}}", [n.title])} onClick={() => selectNode(n)}>{previews[n.id] ? <img src={previews[n.id]} alt="" /> : <ImageIcon size={21} strokeWidth={1.2} />}</button></td><td><strong>{n.title}</strong><small>{f.scene}</small></td><td>{f.dialogue || "—"}</td><td>{f.action || "—"}</td><td>{f.cameraDirection || "—"}</td><td><button className={`table-status status-${n.status}`} disabled={running} onClick={() => void startEdit(n).catch(handleError)} aria-label={uiText("编辑分镜 {{ui:0}}", [n.title])}><span />{uiText(statusLabels[n.status] ?? n.status)}<ChevronDown size={11} /></button></td></tr>; })}</tbody></table></div> : emptyState(Film, uiText("把故事变成分镜"), setting ? uiText("添加第一个镜头，安排画面、对白和运镜。") : uiText("先保存故事设定，再开始拆解镜头。")))}
          {stage === "production" && (shots.length ? <div className="production-workspace"><div className="production-list">{visibleShots.map(n => <button key={n.id} className={`production-shot ${selectedId === n.id ? "selected" : ""}`} onClick={() => selectNode(n)}><span className="production-thumb">{previews[n.id] ? <img src={previews[n.id]} alt="" /> : <Film size={23} strokeWidth={1.2} />}</span><span className="production-detail"><strong>{n.title}</strong><small>{uiText("镜头")}{String(n.order).padStart(2,"0")} · {(fields(n) as { durationSeconds: number }).durationSeconds}s</small></span><span className="selection-state">{selectedId === n.id ? <><Check size={13} />{uiText("已选中")}</> : <ChevronRight size={15} />}</span></button>)}</div><div className="production-guide"><h3>{uiText("逐镜头完成制作")}</h3><p>{uiText("选择镜头，在右侧生成首帧、尾帧与视频。每次生成都会确认模型和费用。")}</p><button disabled={running || selectedNode?.type !== "comic-segment-script"} onClick={() => void run(uiText("为选中分镜 {{ui:0}} 建立首帧、尾帧和视频制作链，只创建结构，不生成媒体。", [selectedId]))}><Plus size={14} />{uiText("建立所选分镜制作链")}</button></div></div> : emptyState(Clapperboard, uiText("还没有可制作的镜头"), uiText("在分镜页添加镜头后，就可以开始制作。")))}
          {search && ((stage === "characters" && !visibleCharacters.length) || (stage !== "characters" && !visibleShots.length)) && <div className="search-empty"><Search size={22} /><p>{uiText("没有找到“")}{search}”</p><button onClick={() => setSearch("")}>{uiText("清除搜索")}</button></div>}
        </div>
        <footer className="workspace-status" aria-hidden="true"><span><Check size={11} />{saveError ? uiText("草稿保存失败") : uiText("修改保存在本地")}</span><span>{stage === "characters" ? uiText("{{ui:0}} 个角色", [visibleCharacters.length]) : uiText("{{ui:0}} 个镜头 · {{ui:1}} 秒", [shots.length, totalDuration])}</span></footer>
      </section>
      {panelOpen && <aside className="studio-inspector" aria-label={showChat ? uiText("AI 导演") : editor ? uiText("编辑面板") : view === "settings" ? uiText("工具设置") : uiText("镜头详情")}>
        <div className={`inspector-heading ${view === "script" && !showChat && !editor && !selectedNode ? "script-heading" : ""}`}><span>{showChat ? <><Sparkles size={15} />{uiText("AI 导演")}</> : view === "settings" ? <><Settings2 size={15} />{uiText("工具设置")}</> : editor ? <><FileText size={15} />{uiText("编辑内容")}</> : <><Film size={15} />{selectedNode?.type === "comic-character" ? uiText("角色详情") : uiText("镜头详情")}</>}</span></div>
        {view === "script" && !showChat && !editor && !selectedNode ? <ScriptPanel shots={shots} drafts={scriptDrafts} busy={running} onDrafts={setScriptDrafts} onSaved={refresh} /> : showChat ? <section className="director" aria-label={uiText("AI 导演对话")}><div className="chat-toolbar"><span>{running ? activity || uiText("正在处理…") : uiText("当前阶段 · {{ui:0}}", [stageLabels[stage]])}</span><button className="text-button" disabled={running} onClick={() => { setMessages([]); setConversationId(crypto.randomUUID()); }}>{uiText("新对话")}<Plus size={12} /></button></div><div className="chat">{!messages.length && <div className="chat-welcome"><Sparkles size={25} strokeWidth={1.3} /><h2>{uiText("让想法进入下一镜")}</h2><p>{uiText("我会结合故事、角色和当前镜头，帮你继续创作。")}</p><button className="suggestion" disabled={running} onClick={() => void run(stageCopy[stage].prompt)}>{uiText(stageCopy[stage].cta)}<ChevronRight size={13} /></button></div>}{messages.map((m,i) => <div key={i} className={`message message-${m.role} ${m.error ? "error" : ""}`}><small>{m.role === "user" ? uiText("你") : uiText("AI 导演")}</small><p>{m.content || (running ? activity || uiText("正在思考…") : uiText("请求已中断，可重新发送。"))}</p></div>)}{interaction && <Interaction key={interaction.id} item={interaction} onDone={() => setInteraction(null)} />}<div ref={chatEnd} /></div><form className="composer" onSubmit={e => { e.preventDefault(); void run(draft); }}><textarea aria-label={uiText("给 AI 导演的指令")} placeholder={uiText("描述你想创作或修改的内容…")} rows={3} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run(draft); } }} /><div><span>{selectedId ? uiText("已关联所选内容") : uiText("已关联当前项目")}</span>{running ? <button type="button" onClick={() => void iterlay.assistant.cancel().catch(handleError)}><Square size={12} />{uiText("停止")}</button> : <button type="button" className="primary" disabled={!draft.trim()} onClick={() => void run(draft)}>{uiText("发送")}<ArrowUp size={14} /></button>}</div></form></section>
        : view === "settings" ? <div className="inspector-scroll settings"><h2>{uiText("导演偏好")}</h2><p className="muted">{uiText("适用于所有短剧项目。")}</p><form onSubmit={async e => { e.preventDefault(); try { await iterlay.storage.set("settings", settings); setSettingsMessage(uiText("设置已保存")); } catch (reason) { setSettingsMessage(String(reason)); } }}><label>{uiText("导演约定")}<textarea rows={6} value={settings.directorNotes === DEFAULT_DIRECTOR_NOTES ? uiText(DEFAULT_DIRECTOR_NOTES) : settings.directorNotes} onChange={e => setSettings(s => ({ ...s, directorNotes: e.target.value }))} /></label><label>{uiText("默认分镜时长 / 秒")}<input type="number" min={1} max={120} required value={settings.defaultDuration} onChange={e => setSettings(s => ({ ...s, defaultDuration: Number(e.target.value) }))} /></label><button className="primary">{uiText("保存设置")}</button>{settingsMessage && <p role="status">{uiText(settingsMessage)}</p>}</form></div>
        : editor ? <div className="inspector-scroll"><Editor key={`${editor.id}:${editor.activeVersionId}`} node={editor} snapshot={snapshot} busy={running} draft={editorDraft?.node.id === editor.id ? editorDraft.values : undefined} onDraft={values => setEditorDraft({ node: editor, values })} onSave={async () => { setEditor(null); setEditorDraft(undefined); setSelectedId(null); await refresh(); }} onCancel={() => setEditor(null)} /></div>
        : selectedNode ? <div className="inspector-scroll selected-detail"><div className="detail-image">{previews[selectedNode.id] ? <img src={previews[selectedNode.id]} alt="" /> : <><ImageIcon size={30} strokeWidth={1.2} /><span>{uiText("画面待生成")}</span></>}</div><h2>{selectedNode.type === "comic-character" ? selectedNode.name : selectedNode.type === "comic-segment-script" ? selectedNode.title : title}</h2><span className={`status status-${selectedNode.status}`}>{uiText(statusLabels[selectedNode.status] ?? selectedNode.status)} {uiText("· 版本")}{selectedNode.versions.length}</span><dl>{Object.entries(fields(selectedNode)!).filter(([key]) => !["title", "constraints"].includes(key)).map(([key,value]) => <div key={key}><dt>{uiText(labels[key] ?? key)}</dt><dd>{Array.isArray(value) ? value.join(" · ") : String(value) || uiText("未填写")}</dd></div>)}</dl><button className="full" disabled={running} onClick={() => void startEdit(selectedNode).catch(handleError)}>{uiText("编辑")}{selectedNode.type === "comic-character" ? uiText("角色") : uiText("分镜")}</button>{selectedNode.type !== "comic-setting" && <button className="primary full" disabled={running} onClick={() => void generateFor(selectedNode)}><Sparkles size={14} />{selectedNode.type === "comic-character" ? uiText("生成角色形象") : uiText("生成首帧画面")}</button>}{selectedNode.type === "comic-segment-script" && <><button className="full" disabled={running} onClick={() => void run(uiText("为分镜 {{ui:0}} 建立首帧、尾帧与视频链，仅创建节点，不生成媒体。", [selectedNode.id]))}><Plus size={14} />{uiText("建立镜头制作链")}</button><button className="full" disabled={running} onClick={() => void run(uiText("为分镜 {{ui:0}} 生成视频。先读取实时状态，若缺少已采用的首尾帧请说明阻塞原因，不得虚报完成。具备条件后依次报价、请求用户确认再提交生成。", [selectedNode.id]))}><Film size={14} />{uiText("生成视频")}</button></>}</div> : null}
      </aside>}
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
