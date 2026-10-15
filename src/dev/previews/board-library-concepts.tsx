import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Grid2X2,
  Image,
  Images,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload
} from "lucide-react";
import appIconDefault from "@/assets/app-icon-default.png";
import boardLibraryReference from "@/assets/board-library-reference.png";
import "./board-library-concepts.css";

type ConceptId = "workbench" | "library" | "gallery" | "preview";

interface BoardItem {
  id: string;
  name: string;
  count: number;
  updated: string;
  crop?: CropData;
  current?: boolean;
}

interface CropData {
  size: number;
  x: number;
  y: number;
}

const crop = (x: number, y: number, width = 588, height = 442): CropData => ({
  size: (3066 / width) * 100,
  x: (x / (3066 - width)) * 100,
  y: (y / (2168 - height)) * 100
});

const boards: BoardItem[] = [
  { id: "hmm", name: "HMM", count: 81, updated: "刚刚", crop: crop(521, 142), current: true },
  { id: "logo", name: "Iterlay Logo", count: 12, updated: "1 分钟前", crop: crop(1142, 142) },
  { id: "room", name: "画板 5", count: 2, updated: "6 小时前", crop: crop(1763, 142) },
  { id: "creator", name: "画板 6", count: 43, updated: "6 小时前", crop: crop(2383, 142) },
  { id: "demo", name: "Demo1", count: 79, updated: "16 小时前", crop: crop(521, 741) },
  { id: "empty", name: "画板 8", count: 0, updated: "16 小时前" },
  { id: "studio", name: "画板 7", count: 4, updated: "17 小时前", crop: crop(1763, 741) },
  { id: "aura", name: "Iterlay 功能演示 · AURA 灯具", count: 6, updated: "20 小时前", crop: crop(2383, 741) },
  { id: "room-two", name: "画板 4", count: 8, updated: "1 天前", crop: crop(521, 1337) }
];

const concepts: Array<{ id: ConceptId; label: string; note: string; summary: string }> = [
  { id: "workbench", label: "A · 焦点工作台", note: "推荐", summary: "先回到当前工作，再浏览其他画板" },
  { id: "library", label: "B · 紧凑资料库", note: "高密度", summary: "一屏管理更多画板，适合重度用户" },
  { id: "gallery", label: "C · 作品画廊", note: "视觉优先", summary: "扩大作品预览，适合快速视觉筛选" },
  { id: "preview", label: "D · 高效资料库", note: "单击进入", summary: "高密度列表，识别画板后一步进入" }
];

function App(): React.ReactElement {
  const [concept, setConcept] = useState<ConceptId>("workbench");

  return (
    <div className="concept-review">
      <header className="concept-switcher">
        <div className="switcher-brand">
          <img src={appIconDefault} alt="" />
          <span>画板库设计探索</span>
        </div>
        <div className="concept-tabs" role="tablist" aria-label="设计方案">
          {concepts.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={concept === item.id}
              onClick={() => setConcept(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.note}</small>
            </button>
          ))}
        </div>
        <div className="review-hint">{concepts.find((item) => item.id === concept)?.summary}</div>
      </header>
      <main className="concept-stage">
        {concept === "workbench" ? <WorkbenchConcept /> : null}
        {concept === "library" ? <LibraryConcept /> : null}
        {concept === "gallery" ? <GalleryConcept /> : null}
        {concept === "preview" ? <PreviewLibraryConcept /> : null}
      </main>
    </div>
  );
}

function WorkbenchConcept(): React.ReactElement {
  return (
    <div className="mock-app concept-a">
      <Sidebar variant="full" />
      <section className="app-main">
        <WorkspaceHeader title="画板库" count="9 个画板" search />
        <div className="workbench-scroll">
          <section className="continue-section">
            <div className="section-heading">
              <div>
                <h2>继续创作</h2>
                <p>最后编辑于刚刚</p>
              </div>
              <button className="text-action">查看活动 <Clock3 /></button>
            </div>
            <button className="active-board" type="button">
              <BoardVisual board={boards[0]} />
              <div className="active-board-copy">
                <span className="current-pill"><span /> 当前画板</span>
                <div>
                  <h3>HMM</h3>
                  <p>81 张图片</p>
                </div>
                <span className="open-board">打开画板 <span>↗</span></span>
              </div>
            </button>
          </section>
          <section className="recent-section">
            <div className="section-heading compact">
              <div>
                <h2>最近更新</h2>
                <p>按最后编辑时间排序</p>
              </div>
              <div className="view-actions" aria-label="视图选项">
                <button className="icon-button selected" type="button" title="网格视图"><Grid2X2 /></button>
                <button className="icon-button" type="button" title="列表视图"><List /></button>
              </div>
            </div>
            <div className="board-grid refined-grid">
              {boards.slice(1).map((board) => <BoardCard key={board.id} board={board} />)}
              <NewBoardCard />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function LibraryConcept(): React.ReactElement {
  return (
    <div className="mock-app concept-b">
      <Sidebar variant="compact" />
      <section className="app-main">
        <header className="library-toolbar">
          <div>
            <h1>画板库</h1>
            <span>9 个画板</span>
          </div>
          <div className="toolbar-center">
            <Search />
            <input aria-label="搜索画板" placeholder="搜索画板" />
            <kbd>⌘ K</kbd>
          </div>
          <HeaderActions />
        </header>
        <div className="library-filters">
          <div className="filter-tabs">
            <button className="active">全部 <span>9</span></button>
            <button>最近使用</button>
            <button>我的画板</button>
          </div>
          <div className="filter-actions">
            <button><ArrowDownUp /> 最近更新 <ChevronDown /></button>
            <div className="view-actions">
              <button className="icon-button selected" type="button" title="列表视图"><List /></button>
              <button className="icon-button" type="button" title="网格视图"><LayoutGrid /></button>
            </div>
          </div>
        </div>
        <div className="board-table-wrap">
          <div className="board-table-head">
            <span>画板</span><span>图片</span><span>最后编辑</span><span>状态</span><span />
          </div>
          <div className="board-table">
            {boards.map((board) => <BoardRow key={board.id} board={board} />)}
          </div>
          <button className="new-row" type="button"><Plus /> 新建空白画板</button>
        </div>
      </section>
    </div>
  );
}

function GalleryConcept(): React.ReactElement {
  return (
    <div className="mock-app concept-c">
      <Sidebar variant="gallery" />
      <section className="app-main gallery-main">
        <WorkspaceHeader title="画板" count="9" />
        <div className="gallery-scroll">
          <div className="gallery-title-row">
            <div>
              <h1>你的工作</h1>
              <p>从上次离开的地方继续</p>
            </div>
            <div className="gallery-sort"><span>最近更新</span><ChevronDown /></div>
          </div>
          <div className="editorial-grid">
            {boards.map((board, index) => (
              <BoardCard key={board.id} board={board} editorial priority={index === 0} />
            ))}
            <NewBoardCard editorial />
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewLibraryConcept(): React.ReactElement {
  return (
    <div className="mock-app concept-d">
      <Sidebar variant="compact" />
      <section className="app-main preview-library-main">
        <header className="preview-toolbar">
          <div className="workspace-title"><h1>画板库</h1><span>9 个画板</span></div>
          <label className="preview-search">
            <Search />
            <input aria-label="搜索画板" placeholder="搜索画板" />
            <kbd>⌘ K</kbd>
          </label>
          <HeaderActions />
        </header>

        <div className="preview-workspace">
          <section className="preview-index" aria-label="画板索引">
            <header className="preview-index-toolbar">
              <div className="preview-filter-tabs" role="group" aria-label="画板筛选">
                <button type="button" aria-pressed="true">全部 <span>9</span></button>
                <button type="button" aria-pressed="false">空画板 <span>1</span></button>
              </div>
              <button className="preview-sort" type="button"><ArrowDownUp /> 最近更新 <ChevronDown /></button>
            </header>

            <div className="preview-list-head" aria-hidden="true">
              <span>画板</span><span>图片</span><span>最近更新</span><span />
            </div>
            <div className="preview-board-list">
              {boards.map((board) => (
                <PreviewBoardRow
                  key={board.id}
                  board={board}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function PreviewBoardRow({ board }: {
  board: BoardItem;
}): React.ReactElement {
  return (
    <div className={`preview-board-row${board.current ? " current" : ""}`}>
      <button className="preview-row-main" type="button" aria-label={`打开画板 ${board.name}`}>
        <span className="preview-row-name">
          <span className="preview-row-thumb"><BoardVisual board={board} /></span>
          <span><strong>{board.name}</strong>{board.current ? <small>当前画板</small> : null}</span>
        </span>
        <span className="preview-row-data">{board.count}</span>
        <span className="preview-row-data">{board.updated}</span>
      </button>
      <button className="preview-row-more" type="button" title={`${board.name} 更多操作`}><MoreHorizontal /></button>
    </div>
  );
}

function Sidebar({ variant }: { variant: "full" | "compact" | "gallery" }): React.ReactElement {
  const isCompact = variant === "compact";
  return (
    <aside className={`app-sidebar sidebar-${variant}`}>
      <div className="traffic-lights"><i /><i /><i /></div>
      <div className="app-brand">
        <img src={appIconDefault} alt="" />
        {!isCompact ? <strong>Iterlay</strong> : null}
      </div>
      <nav className="primary-nav" aria-label="库导航">
        <NavButton icon={<LayoutGrid />} label="画板库" active compact={isCompact} />
        <NavButton icon={<Image />} label="素材库" compact={isCompact} />
        <NavButton icon={<Sparkles />} label="模版库" compact={isCompact} />
      </nav>
      {!isCompact ? (
        <div className="recent-nav">
          <div className="nav-label"><span>最近画板</span><button title="展开最近画板"><ChevronDown /></button></div>
          {boards.slice(0, variant === "gallery" ? 5 : 6).map((board) => (
            <button key={board.id} className={board.current ? "active" : ""} type="button">
              <span className="mini-thumb">
                <BoardVisual board={board} />
              </span>
              <span>{board.name}</span>
              {board.current ? <i /> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="compact-spacer" />
      )}
      <div className="sidebar-footer">
        <NavButton icon={<Download />} label="检查更新" compact={isCompact} meta={!isCompact ? "v0.1.19" : undefined} />
        <NavButton icon={<ShieldCheck />} label="授权" compact={isCompact} meta={!isCompact ? "已授权" : undefined} success />
        <NavButton icon={<Settings />} label="设置" compact={isCompact} />
      </div>
    </aside>
  );
}

function NavButton({ icon, label, active, compact, meta, success }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  compact?: boolean;
  meta?: string;
  success?: boolean;
}): React.ReactElement {
  return (
    <button className={`nav-button${active ? " active" : ""}`} type="button" title={compact ? label : undefined}>
      {icon}
      {!compact ? <span>{label}</span> : null}
      {meta ? <small className={success ? "success" : ""}>{meta}</small> : null}
    </button>
  );
}

function WorkspaceHeader({ title, count, search = false }: { title: string; count: string; search?: boolean }): React.ReactElement {
  return (
    <header className="workspace-header">
      <div className="workspace-title"><h1>{title}</h1><span>{count}</span></div>
      {search ? (
        <label className="header-search"><Search /><input aria-label="搜索画板" placeholder="搜索画板" /></label>
      ) : <div className="header-spacer" />}
      <HeaderActions />
    </header>
  );
}

function HeaderActions(): React.ReactElement {
  return (
    <div className="header-actions">
      <button className="secondary-button" type="button"><Upload /> 导入</button>
      <button className="primary-button" type="button"><Plus /> 新建画板</button>
    </div>
  );
}

function BoardVisual({ board }: { board: BoardItem }): React.ReactElement {
  if (!board.crop) return <div className="board-visual"><Images /></div>;
  const cropStyle = {
    backgroundImage: `url(${boardLibraryReference})`,
    backgroundPosition: `${board.crop.x}% ${board.crop.y}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${board.crop.size}% auto`
  } as React.CSSProperties;
  return <div className="board-visual"><span className="board-crop" style={cropStyle} /></div>;
}

function BoardCard({ board, editorial = false, priority = false }: { board: BoardItem; editorial?: boolean; priority?: boolean }): React.ReactElement {
  return (
    <article className={`board-card${editorial ? " editorial-card" : ""}${priority ? " priority-card" : ""}${board.current ? " is-current" : ""}`}>
      <button className="board-open" type="button">
        <BoardVisual board={board} />
        {board.current ? <span className="visual-status"><Check /> 当前</span> : null}
      </button>
      <div className="board-meta">
        <div>
          <h3>{board.name}</h3>
          <p>{board.count} 张图片 <span>·</span> {board.updated}</p>
        </div>
        <button className="more-button" type="button" title={`${board.name} 更多操作`}><MoreHorizontal /></button>
      </div>
    </article>
  );
}

function BoardRow({ board }: { board: BoardItem }): React.ReactElement {
  return (
    <button className={`board-row${board.current ? " current" : ""}`} type="button">
      <span className="row-name">
        <span className="row-thumb"><BoardVisual board={board} /></span>
        <span><strong>{board.name}</strong><small>{board.current ? "当前画板" : "本地画板"}</small></span>
      </span>
      <span className="row-data">{board.count}</span>
      <span className="row-data">{board.updated}</span>
      <span className={`status-label${board.current ? " active" : ""}`}><i />{board.current ? "使用中" : "已同步"}</span>
      <span className="row-more"><MoreHorizontal /></span>
    </button>
  );
}

function NewBoardCard({ editorial = false }: { editorial?: boolean }): React.ReactElement {
  return (
    <button className={`new-board-card${editorial ? " editorial-new" : ""}`} type="button">
      <span><Plus /></span>
      <div><strong>新建画板</strong><small>从空白画板开始</small></div>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
