import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownUp, Check, ChevronDown, Copy, Download, Grid2X2, ImageOff,
  Images, Lightbulb, List, Loader2, MoreHorizontal, PanelLeftClose,
  Pencil, Plus, RadioTower, RotateCcw, Search, Settings, Sparkles, Trash2, Upload, X
} from "lucide-react";
import type { BoardSummary } from "@shared/types";
import { BoardLibrary, formatStorageSize } from "@/components/workbench/BoardLibrary";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import architecture from "@/assets/creative-direction-architecture.png";
import gallery from "@/assets/creative-direction-gallery.png";
import rain from "@/assets/creative-direction-rain.png";
import lamp from "@/assets/tour-demo-lamp.jpg";
import reference from "@/assets/board-library-reference.png";
import inspiration from "@/assets/creative-inspiration-gallery.png";
import icon from "@/assets/app-icon-default.png";
import "@/styles.css";
import "./board-library-rebuild.css";

// Both views receive the same synthetic records and existing repository artwork.
const sampleBoards: BoardSummary[] = [
  ["香水视觉 · 城市光影", architecture, 24],
  ["香水视觉 · 雨夜街景", rain, 18],
  ["AURA 灯具 / 产品视觉", lamp, 36],
  ["香水视觉 · 展陈空间", gallery, 43],
  ["界面设计参考与版式探索", reference, 12],
  ["香水视觉 · 静物研究", inspiration, 27],
  ["新项目 · 待开始", undefined, 0],
  ["品牌提案 · 封面待恢复", undefined, 8]
].map(([name, thumbnailDataUrl, imageCount], index) => ({
  id: `preview-${index}`,
  name: String(name),
  thumbnailDataUrl: typeof thumbnailDataUrl === "string" ? thumbnailDataUrl : undefined,
  imageCount: Number(imageCount),
  storageBytes: Number(imageCount) * 1024 * 1024,
  createdAt: new Date(Date.UTC(2026, 8, 1 + index, 9)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 8, 9 - index, 9)).toISOString()
}));

type Scenario = "normal" | "empty" | "no-results" | "states" | "importing";
const scenarios: Array<[Scenario, string]> = [
  ["normal", "默认"], ["empty", "空库"], ["no-results", "无结果"],
  ["states", "卡片状态"], ["importing", "导入中"]
];

function Preview(): React.ReactElement {
  const [before, setBefore] = useState(false);
  const [dark, setDark] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [boards, setBoards] = useState(sampleBoards);
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState(false);
  const [compact, setCompact] = useState(false);
  const visibleBoards = scenario === "empty" ? [] : boards;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  function simulate(action: string): void {
    setNotice(`${action}仅演示交互，不读写真实画板。`);
  }

  function createBoard(): void {
    setBoards((current) => [{
      id: `preview-${crypto.randomUUID()}`, name: "未命名画板", imageCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, ...current]);
    setScenario("normal");
    simulate("新建画板");
  }

  function rename(id: string, name: string): void {
    setBoards((current) => current.map((board) => board.id === id ? { ...board, name } : board));
    simulate("重命名");
  }

  function duplicate(board: BoardSummary): void {
    setBoards((current) => [{ ...board, id: crypto.randomUUID(), name: `${board.name} 副本` }, ...current]);
    simulate("复制");
  }

  return (
    <div className="rebuild-preview">
      <div className="rp-workspace">
        <aside className={`rp-sidebar ${compact ? "rp-compact" : ""}`} aria-label="侧栏上下文示意，非重构范围">
          <div className="rp-brand"><img src={icon} alt="" /><strong>Iterlay</strong><button className="rp-icon" aria-label="切换侧栏宽度" onClick={() => setCompact(!compact)}><PanelLeftClose /></button></div>
          <button className="rp-primary rp-sidebar-create" onClick={() => simulate("创作助手")}><Plus /><span>创作助手</span></button>
          <span className="rp-sidebar-label">工作台</span>
          <nav aria-label="工作台示意">
            {[[Grid2X2, "画板库"], [Images, "素材库"], [Sparkles, "模版库"], [Lightbulb, "灵感"]].map(([Icon, label]) => {
              const NavIcon = Icon as typeof Images;
              return <button key={String(label)} title={String(label)} className={label === "画板库" ? "rp-nav-active" : ""} onClick={() => simulate(String(label))}><NavIcon /><span>{String(label)}</span></button>;
            })}
          </nav>
          <span className="rp-sidebar-label">我的画板 <span>{visibleBoards.length}</span></span>
          <div className="rp-recents">{visibleBoards.slice(0, 6).map((board) => <button key={board.id} title={board.name} onClick={() => simulate("打开画板")}>
            {board.thumbnailDataUrl ? <img src={board.thumbnailDataUrl} alt="" /> : <Images />}
            <span><strong>{board.name}</strong><small>最近更新</small></span>
          </button>)}</div>
          <nav className="rp-utilities">
            <button title="在线分享管理" onClick={() => simulate("在线分享")}><RadioTower /><span>在线分享管理</span></button>
            <button title="回收站" onClick={() => simulate("回收站")}><Trash2 /><span>回收站</span></button>
            <button title="设置" onClick={() => simulate("设置")}><Settings /><span>设置</span></button>
          </nav>
        </aside>
        <main className="rp-main">
          {before ? <BoardLibrary
            key={scenario}
            boards={visibleBoards}
            activeBoardId="preview-0"
            openingBoardId={scenario === "states" ? "preview-2" : undefined}
            onOpenBoard={() => simulate("打开画板")}
            onPrefetchBoard={() => undefined}
            onCreateBoard={createBoard}
            onRenameBoard={rename}
            onDuplicateBoard={(id) => { const board = boards.find((item) => item.id === id); if (board) duplicate(board); }}
            onDeleteBoard={async () => simulate("移入回收站")}
            onExportBoard={() => simulate("导出")}
            onImportBoard={async () => simulate("导入")}
            onImportBoardFiles={async () => simulate("拖入文件")}
            onClose={() => simulate("返回画布")}
          /> : <ProposedLibrary
            key={scenario}
            boards={visibleBoards}
            scenario={scenario}
            onCreate={createBoard}
            onRename={rename}
            onDuplicate={duplicate}
            onDelete={(id) => { setBoards((current) => current.filter((board) => board.id !== id)); simulate("移入回收站"); }}
            onAction={simulate}
          />}
        </main>
      </div>
      {notice ? <div className="rp-notice" role="status">{notice}<button className="rp-icon" aria-label="关闭提示" onClick={() => setNotice("")}><X /></button></div> : null}
      {notes ? <section className="rp-notes" aria-label="设计说明">
        <div><strong>范围与变化</strong><button className="rp-icon" aria-label="关闭设计说明" onClick={() => setNotes(false)}><X /></button></div>
        <p><b>R1 · 保留</b> 侧栏只提供上下文示意，不改变生产侧栏。</p>
        <p><b>R2 · 重构</b> 标题与操作独立，筛选移到工具栏，搜索有完整空间。</p>
        <p><b>R3 · 重构</b> 4:3 封面、14px 名称、12px 元信息，按内容宽度排列。</p>
        <p><b>R4 · 移除重复入口</b> 新建不再占首张卡片，仍可从右上角创建。</p>
        <p>“当前组件”实时渲染仓库中的 BoardLibrary；两种视图使用相同演示数据。安装版已现场检查，数据与此处不同。</p>
        <p>状态选择器仅用于新方案；当前组件请直接操作搜索和列表。导入、导出及打开画板只演示反馈。</p>
        <p>本页尚未接入生产。请在对话中反馈或确认预览。</p>
      </section> : null}
      <footer className="rp-review" aria-label="预览工具">
        <span className="rp-preview-label">独立预览 · 演示数据</span>
        <div className="rp-review-switch">
          <button aria-pressed={before} onClick={() => setBefore(true)}>当前组件</button>
          <button aria-pressed={!before} onClick={() => setBefore(false)}>新方案</button>
        </div>
        <select aria-label="预览状态" value={scenario} disabled={before} onChange={(event) => setScenario(event.target.value as Scenario)}>{scenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? "深色" : "浅色"}</button>
        <button aria-expanded={notes} onClick={() => setNotes(!notes)}>设计说明</button>
      </footer>
    </div>
  );
}

function ProposedLibrary({ boards, scenario, onCreate, onRename, onDuplicate, onDelete, onAction }: {
  boards: BoardSummary[]; scenario: Scenario; onCreate: () => void;
  onRename: (id: string, name: string) => void; onDuplicate: (board: BoardSummary) => void;
  onDelete: (id: string) => void; onAction: (action: string) => void;
}): React.ReactElement {
  const [query, setQuery] = useState(scenario === "no-results" ? "不存在的画板" : "");
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BoardSummary | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const renameCancelled = useRef(false);
  const busy = importing || scenario === "importing";
  const locked = busy || renaming !== null || deleteTarget !== null || opening !== null || scenario === "states";
  const customized = Boolean(query || emptyOnly || sort !== "updated");
  const filtered = boards.filter((board) => (!emptyOnly || board.imageCount === 0) && board.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN") : Date.parse(sort === "created" ? b.createdAt : b.updatedAt) - Date.parse(sort === "created" ? a.createdAt : a.updatedAt));

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.defaultPrevented || locked) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); searchRef.current?.focus();
      }
      if (event.key === "Escape") setQuery("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked]);

  function startRename(board: BoardSummary): void {
    renameCancelled.current = false; setRenaming(board.id); setName(board.name);
  }
  function commitRename(): void {
    if (renameCancelled.current) return;
    if (renaming && name.trim()) onRename(renaming, name.trim());
    else onAction("空名称不会保存；");
    setRenaming(null);
  }
  function simulateImport(): void {
    setImporting(true);
    timers.current.push(setTimeout(() => { setImporting(false); onAction("导入预览结束；"); }, 1400));
  }
  function open(board: BoardSummary): void {
    setOpening(board.id);
    timers.current.push(setTimeout(() => { setOpening(null); onAction(`打开「${board.name}」`); }, 800));
  }
  function reset(): void { setQuery(""); setEmptyOnly(false); setSort("updated"); }

  function card(board: BoardSummary): React.ReactElement {
    const current = board.id === "preview-0";
    const generating = scenario === "states" && board.id === "preview-1";
    const loading = opening === board.id || (scenario === "states" && board.id === "preview-2");
    return <article className={`rp-card ${current ? "rp-current" : ""}`} key={board.id}>
      <button className="rp-cover" disabled={locked} aria-label={`打开画板 ${board.name}`} aria-busy={loading} onClick={() => open(board)}>
        {board.thumbnailDataUrl ? <img src={board.thumbnailDataUrl} alt="" draggable={false} /> : <span className="rp-placeholder">
          {board.imageCount ? <ImageOff /> : <Images />}
          <span>{board.imageCount ? "封面暂不可用" : "空画板"}</span>
          <small>{board.imageCount ? "画板内容不受影响" : "从一个想法开始"}</small>
        </span>}
        {current ? <span className="rp-badge"><Check />当前画板</span> : null}
        {generating ? <span className="rp-badge rp-generating"><Loader2 className="rp-spin" />生成中</span> : null}
        {loading ? <span className="rp-opening"><Loader2 className="rp-spin" /><span>正在打开</span></span> : null}
      </button>
      <div className="rp-card-info">
        <div className="rp-title-row">
          {renaming === board.id ? <input autoFocus aria-label="画板新名称" value={name} onChange={(event) => setName(event.target.value)} onBlur={commitRename} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") { event.stopPropagation(); renameCancelled.current = true; setRenaming(null); }
          }} /> : <><strong title={board.name}>{board.name}</strong><button className="rp-icon rp-edit" aria-label={`重命名 ${board.name}`} disabled={locked} onClick={() => startRename(board)}><Pencil /></button></>}
        </div>
        <span className="rp-meta">{board.imageCount} 张图片 <span>·</span> {dateLabel(board.updatedAt)}</span>
      </div>
      {view === "list" ? <><span className="rp-list-count">{board.imageCount}</span><span className="rp-list-date">{dateLabel(board.updatedAt)}</span><span className="rp-list-size">{formatStorageSize(board.storageBytes)}</span></> : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button className="rp-icon rp-more" aria-label={`画板操作 ${board.name}`} disabled={locked}><MoreHorizontal /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => startRename(board)}><Pencil className="h-4 w-4" />重命名</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(board)}><Copy className="h-4 w-4" />复制画板</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("导出")}><Download className="h-4 w-4" />导出画板</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDeleteTarget(board)}><Trash2 className="h-4 w-4" />移入回收站</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>;
  }

  return <div className="rp-library">
    <header className="rp-header">
      <div><h1>画板库</h1><span>{boards.length} 个画板</span></div>
      <div><button className="rp-button" disabled={locked} onClick={simulateImport}><Upload />导入</button><button className="rp-primary" disabled={locked} onClick={onCreate}><Plus />新建画板</button></div>
    </header>
    <div className="rp-toolbar">
      <div className="rp-filters" role="group" aria-label="画板筛选">
        <button aria-pressed={!emptyOnly} disabled={locked} onClick={() => setEmptyOnly(false)}>全部 <span>{boards.length}</span></button>
        <button aria-pressed={emptyOnly} disabled={locked} onClick={() => setEmptyOnly(true)}>空画板 <span>{boards.filter((board) => !board.imageCount).length}</span></button>
      </div>
      <div className="rp-tools">
        {customized ? <button className="rp-icon" title="重置筛选与排序" aria-label="重置筛选与排序" disabled={locked} onClick={reset}><RotateCcw /></button> : null}
        <label className="rp-search"><Search /><input ref={searchRef} aria-label="搜索画板" placeholder="搜索画板" value={query} disabled={locked} onChange={(event) => setQuery(event.target.value)} />
          {query ? <button className="rp-icon" aria-label="清除搜索" disabled={locked} onClick={() => setQuery("")}><X /></button> : <kbd>⌘ K</kbd>}
        </label>
        <div className="rp-sort"><ArrowDownUp /><select aria-label="画板排序" disabled={locked} value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">最近更新</option><option value="created">创建时间</option><option value="name">名称</option></select><ChevronDown /></div>
        <div className="rp-view" role="group" aria-label="画板视图">
          <button className="rp-icon" aria-label="卡片模式" aria-pressed={view === "grid"} disabled={locked} onClick={() => setView("grid")}><Grid2X2 /></button>
          <button className="rp-icon" aria-label="列表模式" aria-pressed={view === "list"} disabled={locked} onClick={() => setView("list")}><List /></button>
        </div>
      </div>
    </div>
    <div className="rp-content" inert={busy ? true : undefined}>
      {query || emptyOnly ? <p className="rp-result-count" role="status">{filtered.length} 个结果</p> : null}
      {filtered.length ? <div className={view === "grid" ? "rp-grid" : "rp-list"}>
        {view === "list" ? <div className="rp-list-heading"><span>画板</span><span>图片</span><span>最近更新</span><span>空间</span><span>操作</span></div> : null}
        {filtered.map(card)}
      </div> : <div className="rp-empty">
        {boards.length ? <Search /> : <Images />}
        <h2>{boards.length ? "没有找到符合条件的画板" : "你的下一次创作，从这里开始"}</h2>
        <p>{boards.length ? "试试其他名称，或清除筛选查看全部画板。" : "创建一个画板，把灵感、参考和作品放在一起。"}</p>
        <div>{boards.length ? <button className="rp-button" onClick={reset}>清除筛选</button> : <><button className="rp-primary" onClick={onCreate}><Plus />新建画板</button><button className="rp-button" onClick={simulateImport}><Upload />导入画板</button></>}</div>
      </div>}
    </div>
    {busy ? <div className="rp-import-overlay" role="status"><Loader2 className="rp-spin" /><h2>正在导入画板</h2><p>正在解析并还原文件，请稍候。</p><small>预览状态，不处理真实文件</small></div> : null}
    <Dialog open={deleteTarget !== null} onOpenChange={(isOpen) => { if (!isOpen) setDeleteTarget(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>移入回收站</DialogTitle><DialogDescription>「{deleteTarget?.name}」将移入回收站。此处仅移除演示记录，不影响真实画板。</DialogDescription></DialogHeader>
        <DialogFooter><button className="rp-button" onClick={() => setDeleteTarget(null)}>取消</button><button className="rp-primary" onClick={() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null); }}>移入回收站</button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
