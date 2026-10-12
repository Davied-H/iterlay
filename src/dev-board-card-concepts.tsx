import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
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
import "./dev-board-card-concepts.css";

type ConceptId = "balanced" | "visual" | "compact";

interface CropData {
  size: number;
  x: number;
  y: number;
}

interface BoardItem {
  id: string;
  name: string;
  count: number;
  updated: string;
  size: string;
  crop?: CropData;
  current?: boolean;
}

const crop = (x: number, y: number, width = 588): CropData => ({
  size: (3066 / width) * 100,
  x: (x / (3066 - width)) * 100,
  y: (y / (2168 - 442)) * 100
});

const boards: BoardItem[] = [
  { id: "hmm", name: "HMM", count: 81, updated: "刚刚", size: "128 MB", crop: crop(521, 142), current: true },
  { id: "logo", name: "Iterlay Logo", count: 12, updated: "1 分钟前", size: "22 MB", crop: crop(1142, 142) },
  { id: "interior", name: "空间氛围探索", count: 24, updated: "6 小时前", size: "46 MB", crop: crop(1763, 142) },
  { id: "character", name: "角色造型研究", count: 43, updated: "6 小时前", size: "78 MB", crop: crop(2383, 142) },
  { id: "campaign", name: "夏季 Campaign", count: 79, updated: "16 小时前", size: "116 MB", crop: crop(521, 741) },
  { id: "empty", name: "未命名画板", count: 0, updated: "16 小时前", size: "0 MB" },
  { id: "studio", name: "工作室提案", count: 18, updated: "17 小时前", size: "31 MB", crop: crop(1763, 741) },
  { id: "aura", name: "AURA 灯具功能演示", count: 36, updated: "20 小时前", size: "63 MB", crop: crop(2383, 741) },
  { id: "reference", name: "品牌参考库", count: 28, updated: "1 天前", size: "51 MB", crop: crop(521, 1337) },
  { id: "motion", name: "动态分镜", count: 14, updated: "2 天前", size: "27 MB", crop: crop(1142, 1337) }
];

const concepts: Array<{ id: ConceptId; label: string; tag: string; note: string }> = [
  { id: "balanced", label: "A · 均衡网格", tag: "推荐", note: "信息与预览平衡，适合作为默认卡片模式" },
  { id: "visual", label: "B · 视觉画廊", tag: "视觉优先", note: "更大的作品预览，适合快速凭画面识别" },
  { id: "compact", label: "C · 紧凑横卡", tag: "高效率", note: "保留列表密度，同时获得更清晰的画板预览" }
];

function App(): React.ReactElement {
  const [concept, setConcept] = useState<ConceptId>("balanced");
  const activeConcept = concepts.find((item) => item.id === concept) ?? concepts[0];

  return (
    <div className="card-review">
      <header className="review-toolbar">
        <div className="review-brand">
          <img src={appIconDefault} alt="" />
          <div><strong>画板库 · 卡片模式</strong><span>视觉方案评审</span></div>
        </div>
        <div className="concept-tabs" role="tablist" aria-label="卡片模式设计方案">
          {concepts.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={concept === item.id}
              onClick={() => setConcept(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.tag}</small>
            </button>
          ))}
        </div>
        <p>{activeConcept.note}</p>
      </header>

      <main className="review-stage">
        <div className={`app-window concept-${concept}`}>
          <Sidebar />
          <section className="library-main">
            <LibraryHeader />
            <div className="library-body">
              <div className="content-head">
                <div className="filter-tabs">
                  <button className="active" type="button">全部 <span>10</span></button>
                  <button type="button">空画板 <span>1</span></button>
                </div>
                <div className="content-actions">
                  <button className="sort-button" type="button"><ArrowDownUp /> 最近更新 <ChevronDown /></button>
                  <div className="view-switch" aria-label="视图模式">
                    <button type="button" title="列表模式"><List /></button>
                    <button className="active" type="button" title="卡片模式"><LayoutGrid /></button>
                  </div>
                </div>
              </div>

              <div className="board-scroll">
                {concept === "balanced" ? <BalancedGrid /> : null}
                {concept === "visual" ? <VisualGallery /> : null}
                {concept === "compact" ? <CompactGrid /> : null}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Sidebar(): React.ReactElement {
  return (
    <aside className="app-sidebar">
      <div className="traffic-lights"><i /><i /><i /></div>
      <img className="app-logo" src={appIconDefault} alt="Iterlay" />
      <nav aria-label="主导航">
        <button type="button" title="创作"><Sparkles /></button>
        <button className="active" type="button" title="画板库"><Grid2X2 /></button>
        <button type="button" title="素材库"><Image /></button>
        <button type="button" title="灵感库"><Sparkles /></button>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button type="button" title="检查更新"><Download /></button>
        <button type="button" title="授权"><ShieldCheck /></button>
        <button type="button" title="设置"><Settings /></button>
      </div>
    </aside>
  );
}

function LibraryHeader(): React.ReactElement {
  return (
    <header className="library-header">
      <div className="page-title"><h1>画板库</h1><span>10 个画板</span></div>
      <label className="search-field">
        <Search />
        <input aria-label="搜索画板" placeholder="搜索画板" />
        <kbd>⌘K</kbd>
      </label>
      <div className="header-actions">
        <button className="import-button" type="button"><Upload /> 导入</button>
        <button className="create-button" type="button"><Plus /> 新建画板</button>
      </div>
    </header>
  );
}

function BalancedGrid(): React.ReactElement {
  return (
    <div className="balanced-grid">
      <CreateCard variant="balanced" />
      {boards.map((board) => <BoardCard key={board.id} board={board} variant="balanced" />)}
    </div>
  );
}

function VisualGallery(): React.ReactElement {
  return (
    <>
      <div className="gallery-label"><span>最近更新</span><small>按画面快速找到你的工作</small></div>
      <div className="visual-grid">
        {boards.map((board) => <BoardCard key={board.id} board={board} variant="visual" />)}
        <CreateCard variant="visual" />
      </div>
    </>
  );
}

function CompactGrid(): React.ReactElement {
  return (
    <div className="compact-grid">
      {boards.map((board) => <BoardCard key={board.id} board={board} variant="compact" />)}
      <CreateCard variant="compact" />
    </div>
  );
}

function BoardCard({ board, variant }: { board: BoardItem; variant: ConceptId }): React.ReactElement {
  return (
    <article className={`board-card ${variant}${board.current ? " current" : ""}`}>
      <button className="board-open" type="button" aria-label={`打开画板 ${board.name}`}>
        <BoardVisual board={board} />
        {board.current ? <span className="current-badge"><Check /> 当前</span> : null}
        {variant === "visual" ? <span className="visual-count">{board.count} 张</span> : null}
      </button>
      <div className="board-info">
        <div className="board-copy">
          <h2>{board.name}</h2>
          <p>
            {variant !== "visual" ? <><span>{board.count} 张图片</span><i /></> : null}
            <span>{board.updated}</span>
            {variant === "compact" ? <><i /><span>{board.size}</span></> : null}
          </p>
        </div>
        <button className="more-button" type="button" title={`${board.name} 更多操作`}><MoreHorizontal /></button>
      </div>
    </article>
  );
}

function BoardVisual({ board }: { board: BoardItem }): React.ReactElement {
  if (!board.crop) {
    return <span className="board-visual empty"><Images /><small>空画板</small></span>;
  }
  const style = {
    backgroundImage: `url(${boardLibraryReference})`,
    backgroundPosition: `${board.crop.x}% ${board.crop.y}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${board.crop.size}% auto`
  } as React.CSSProperties;
  return <span className="board-visual"><span className="board-crop" style={style} /></span>;
}

function CreateCard({ variant }: { variant: ConceptId }): React.ReactElement {
  return (
    <button className={`create-card ${variant}`} type="button">
      <span className="create-icon"><Plus /></span>
      <span><strong>新建画板</strong><small>从空白画板开始</small></span>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
