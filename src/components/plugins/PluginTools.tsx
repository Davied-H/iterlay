import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puzzle, Plus, X, Settings2, Download, Trash2, Power, Clapperboard, Upload } from "lucide-react";
import { SHORT_DRAMA_PLUGIN_ID, type InstalledPlugin, type PluginManifest } from "@shared/plugins";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { PluginFrame, type PluginHostProps } from "./PluginFrame";
import "./plugins.css";

const permissionLabels: Record<string, string> = { "board:read": "读取当前画板", "board:write": "修改当前画板", storage: "保存独立配置与项目数据", "assistant:comic-drama": "调用短剧助手及媒体模型（可能产生费用）" };
export function PluginTools({ workspace = false, onLaunchShortDrama, ...host }: PluginHostProps & { workspace?: boolean; onLaunchShortDrama?: () => void }) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [catalog, setCatalog] = useState<PluginManifest[]>([]);
  const [manager, setManager] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(workspace ? SHORT_DRAMA_PLUGIN_ID : null);
  const [view, setView] = useState<"tool" | "settings">("tool");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<{ manifest: PluginManifest; bytes?: Uint8Array } | null>(null);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(async () => {
    const api = getImageWorkbenchApi();
    const [installed, available] = await Promise.all([api.listPlugins(), api.listPluginCatalog()]);
    setPlugins(installed); setCatalog(available);
  }, []);
  useEffect(() => { void refresh().catch(reason => setError(getWorkbenchErrorMessage(reason))); }, [refresh]);
  useEffect(() => { if (manager) dialog.current?.showModal(); else dialog.current?.close(); }, [manager]);
  const selected = plugins.find(p => p.manifest.id === selectedId && p.enabled);
  const context = useMemo(() => host.context, [host.context]);
  async function action(operation: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await operation(); await refresh(); } catch (reason) { setError(getWorkbenchErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  function open(plugin: InstalledPlugin) {
    if (!workspace && plugin.manifest.id === SHORT_DRAMA_PLUGIN_ID) { onLaunchShortDrama?.(); return; }
    setView("tool"); setSelectedId(plugin.manifest.id);
  }
  return <>
    {workspace && selected && selected.manifest.surface !== "workspace" && <div className="plugin-legacy-workspace-controls"><button onClick={host.onBack}>返回主画板</button><span>此工具有新版制作工作台</span><button onClick={() => setManager(true)}>插件市场</button></div>}
    <nav className={`plugin-launcher ${workspace ? "plugin-launcher--workspace" : ""}`} aria-label="插件工具">
      {plugins.filter(p => p.enabled).map(p => <button key={p.manifest.id} title={p.manifest.name} aria-label={p.manifest.name} aria-pressed={selectedId === p.manifest.id} onClick={() => open(p)}>{p.manifest.id === SHORT_DRAMA_PLUGIN_ID ? <Clapperboard /> : <Puzzle />}</button>)}
      <button title="插件市场" aria-label="插件市场" onClick={() => setManager(true)}><Plus /></button>
    </nav>
    {selected ? <aside className={`plugin-panel ${workspace ? "plugin-panel--workspace" : ""}`} aria-label="工具面板">
      <header><span><Clapperboard size={16} />{selected.manifest.name}<small>v{selected.manifest.version}</small></span><div>
        {selected.manifest.settings && <button aria-label={view === "settings" ? "返回工具" : "工具设置"} title={view === "settings" ? "返回工具" : "工具设置"} onClick={() => setView(v => v === "tool" ? "settings" : "tool")}><Settings2 size={16} /></button>}
        {!workspace && <button aria-label="关闭工具" onClick={() => setSelectedId(null)}><X size={16} /></button>}
      </div></header>
      <PluginFrame onManage={() => setManager(true)} key={`${selected.manifest.id}:${host.context.boardId}:${view}`} plugin={selected} view={view} {...host} context={context} />
    </aside> : workspace ? <aside className="plugin-panel plugin-panel--workspace"><div className="plugin-missing"><Clapperboard size={28} /><h2>安装短剧助手</h2><p>画板内容已保留。安装或启用工具后，即可继续剧本、角色与分镜制作。</p><button className="plugin-primary" onClick={() => setManager(true)}>打开插件市场</button>{host.onBack && <button className="plugin-fallback-back" onClick={host.onBack}>返回主画板</button>}</div></aside> : null}
    {error && !manager ? <div className="plugin-inline-error" role="alert">{error}<button onClick={() => setError("")}>关闭</button></div> : null}
    <dialog ref={dialog} className="plugin-manager" onCancel={() => setManager(false)} onClick={event => { if (event.target === dialog.current) setManager(false); }}>
      <section><header><div><h2>插件市场</h2><p>为你的画板添加新的创作工具</p></div><button aria-label="关闭插件市场" onClick={() => setManager(false)}><X size={20} /></button></header>
        <div className="plugin-manager-toolbar"><input aria-label="搜索插件" placeholder="搜索名称、功能或开发者" value={query} onChange={e => setQuery(e.target.value)} /><button disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />导入插件</button><input ref={input} type="file" hidden accept=".iterlay-plugin" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void action(async () => { if (file.size > 8 * 1024 * 1024) throw new Error("插件包必须小于 8MB。"); const bytes = new Uint8Array(await file.arrayBuffer()); const manifest = await getImageWorkbenchApi().inspectPlugin(bytes); setCandidate({ manifest, bytes }); }); }} /></div>
        {error && <p className="plugin-error" role="alert">{error}</p>}
        {candidate ? <div className="plugin-install-review"><h3>安装 {candidate.manifest.name}</h3><p>{candidate.manifest.author} · {candidate.manifest.version}</p><p>该插件请求以下权限：</p><ul>{candidate.manifest.permissions.map(p => <li key={p}>{permissionLabels[p]}</li>)}</ul><p>只安装你信任的插件。更新后仍会保留插件项目数据。</p><div><button disabled={busy} onClick={() => setCandidate(null)}>取消</button><button className="plugin-primary" disabled={busy} onClick={() => void action(async () => { const api = getImageWorkbenchApi(); if (candidate.bytes) await api.installPlugin(candidate.bytes); else await api.installCatalogPlugin(candidate.manifest.id); setCandidate(null); })}>{busy ? "正在安装…" : "确认安装"}</button></div></div> : <>
          <h3 className="plugin-section-title">官方插件</h3>
          {catalog.filter(m => `${m.name}${m.description}${m.author}`.toLowerCase().includes(query.toLowerCase())).map(m => {
            const installed = plugins.find(p => p.manifest.id === m.id);
            return <article className="plugin-catalog-item" key={m.id}><div className="plugin-catalog-icon"><Clapperboard size={24} /></div><div><h3>{m.name}<small>{m.version}</small></h3><p>{m.description}</p><span>{m.author} · 工具</span></div><button disabled={busy || installed?.manifest.version === m.version} onClick={() => setCandidate({ manifest: m })}><Download size={14} />{installed ? installed.manifest.version === m.version ? "已安装" : "更新" : "安装"}</button></article>;
          })}
          <h3 className="plugin-section-title">已安装 · {plugins.length}</h3>
          {!plugins.length && <p className="plugin-message">安装官方工具，或导入开发者提供的 .iterlay-plugin 文件。</p>}
          {plugins.filter(p => `${p.manifest.name}${p.manifest.description}`.includes(query)).map(p => <article className="plugin-installed-item" key={p.manifest.id}><div><strong>{p.manifest.name}</strong><small>{p.manifest.version} · {p.enabled ? "已启用" : "已停用"}</small></div><button title={p.enabled ? "停用" : "启用"} aria-label={`${p.enabled ? "停用" : "启用"}${p.manifest.name}`} disabled={busy} onClick={() => void action(() => getImageWorkbenchApi().setPluginEnabled(p.manifest.id, !p.enabled))}><Power size={16} /></button><button title="卸载（保留项目数据）" aria-label={`卸载${p.manifest.name}`} disabled={busy} onClick={() => void action(() => getImageWorkbenchApi().uninstallPlugin(p.manifest.id))}><Trash2 size={16} /></button></article>)}
          <p className="plugin-catalog-note">当前提供随应用发布的官方目录与本地导入。第三方在线市场尚未开放。</p>
        </>}
      </section>
    </dialog>
  </>;
}
