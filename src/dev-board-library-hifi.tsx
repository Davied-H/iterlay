import React from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Clock3,
  Download,
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
import "./dev-board-library-hifi.css";

interface BoardData {
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

const boards: BoardData[] = [
  { id: "hmm", name: "HMM", count: 81, updated: "刚刚", crop: crop(521, 142), current: true },
  { id: "logo", name: "Iterlay Logo", count: 12, updated: "1 分钟前", crop: crop(1142, 142) },
  { id: "board-5", name: "画板 5", count: 2, updated: "6 小时前", crop: crop(1763, 142) },
  { id: "board-6", name: "画板 6", count: 43, updated: "6 小时前", crop: crop(2383, 142) },
  { id: "demo", name: "Demo1", count: 79, updated: "16 小时前", crop: crop(521, 741) },
  { id: "empty", name: "画板 8", count: 0, updated: "16 小时前" },
  { id: "board-7", name: "画板 7", count: 4, updated: "17 小时前", crop: crop(1763, 741) },
  { id: "aura", name: "Iterlay 功能演示 · AURA 灯具", count: 6, updated: "20 小时前", crop: crop(2383, 741) },
  { id: "board-4", name: "画板 4", count: 8, updated: "1 天前", crop: crop(521, 1337) }
];

function App(): React.ReactElement {
  return (
    <div className="hifi-review">
      <header className="review-bar">
        <div className="review-title">
          <img src={appIconDefault} alt="" />
          <strong>Iterlay</strong>
          <span>画板库 · 高保真提案</span>
        </div>
        <div className="review-status"><i /> 可交互预览</div>
      </header>
      <main className="review-stage">
        <div className="window-shell">
          <LibrarySidebar />
          <section className="library-main">
            <LibraryHeader />
            <div className="library-scroll">
              <div className="library-container">
                <section className="recent-section" aria-labelledby="recent-heading">
                  <div className="section-title-row">
                    <div>
                      <h1 id="recent-heading">最近打开</h1>
                      <p>按最近使用排序</p>
                    </div>
                    <button className="activity-button" type="button"><Clock3 /> 最近活动</button>
                  </div>
                  <div className="recent-grid">
                    {boards.slice(0, 4).map((board) => <RecentProject key={board.id} board={board} />)}
                  </div>
                </section>

                <section className="all-section" aria-labelledby="all-heading">
                  <div className="section-title-row all-title-row">
                    <div>
                      <h2 id="all-heading">所有画板</h2>
                      <p>9 个画板，按最近更新排序</p>
                    </div>
                    <div className="board-controls">
                      <button className="sort-button" type="button"><ArrowDownUp /> 最近更新 <ChevronDown /></button>
                      <div className="view-switch" aria-label="视图切换">
                        <button className="active" type="button" title="舒适视图"><LayoutGrid /></button>
                        <button type="button" title="紧凑视图"><List /></button>
                      </div>
                    </div>
                  </div>
                  <div className="board-index">
                    {boards.map((board) => <BoardIndexItem key={board.id} board={board} />)}
                    <button className="create-index-item" type="button">
                      <span><Plus /></span>
                      <span><strong>新建画板</strong><small>从空白画板开始</small></span>
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function LibrarySidebar(): React.ReactElement {
  return (
    <aside className="library-sidebar">
      <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
      <div className="brand-row">
        <img src={appIconDefault} alt="" />
        <strong>Iterlay</strong>
      </div>
      <nav className="main-nav" aria-label="库导航">
        <SidebarButton icon={<LayoutGrid />} label="画板库" active />
        <SidebarButton icon={<Image />} label="素材库" />
        <SidebarButton icon={<Sparkles />} label="模版库" />
      </nav>
      <div className="recent-nav">
        <div className="sidebar-label"><span>最近画板</span><ChevronDown /></div>
        {boards.slice(0, 6).map((board) => (
          <button key={board.id} type="button" className={board.current ? "current" : ""}>
            <span className="sidebar-thumb"><BoardCrop board={board} /></span>
            <span>{board.name}</span>
            {board.current ? <i aria-label="当前画板" /> : null}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <SidebarButton icon={<Download />} label="检查更新" meta="v0.1.19" />
        <SidebarButton icon={<ShieldCheck />} label="授权" meta="已授权" success />
        <SidebarButton icon={<Settings />} label="设置" />
      </div>
    </aside>
  );
}

function SidebarButton({ icon, label, active, meta, success }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  meta?: string;
  success?: boolean;
}): React.ReactElement {
  return (
    <button className={`sidebar-button${active ? " active" : ""}`} type="button">
      {icon}<span>{label}</span>
      {meta ? <small className={success ? "success" : ""}>{meta}</small> : null}
    </button>
  );
}

function LibraryHeader(): React.ReactElement {
  return (
    <header className="library-header">
      <div className="page-title"><strong>画板库</strong><span>9</span></div>
      <label className="search-field"><Search /><input aria-label="搜索画板" placeholder="搜索画板" /><kbd>⌘ K</kbd></label>
      <div className="header-actions">
        <button className="import-button" type="button"><Upload /> 导入</button>
        <button className="new-button" type="button"><Plus /> 新建画板</button>
      </div>
    </header>
  );
}

function RecentProject({ board }: { board: BoardData }): React.ReactElement {
  return (
    <article className={`recent-project${board.current ? " current" : ""}`}>
      <button className="project-visual" type="button" aria-label={`打开 ${board.name}`}>
        <BoardCrop board={board} />
        {board.current ? <span className="project-status"><Check /> 当前</span> : null}
        <span className="project-open">打开 <span>↗</span></span>
      </button>
      <div className="project-meta">
        <div><h3>{board.name}</h3><p>{board.count} 张图片 · {board.updated}</p></div>
        <button type="button" title={`${board.name} 更多操作`}><MoreHorizontal /></button>
      </div>
    </article>
  );
}

function BoardIndexItem({ board }: { board: BoardData }): React.ReactElement {
  return (
    <article className="index-item">
      <button className="index-visual" type="button" aria-label={`打开 ${board.name}`}>
        <BoardCrop board={board} />
        <span><Check /> 打开</span>
      </button>
      <div className="index-copy">
        <div><h3>{board.name}</h3><p>{board.count} 张图片 · {board.updated}</p></div>
        <button type="button" title={`${board.name} 更多操作`}><MoreHorizontal /></button>
      </div>
    </article>
  );
}

function BoardCrop({ board }: { board: BoardData }): React.ReactElement {
  if (!board.crop) return <span className="empty-board"><Images /></span>;
  const cropStyle = {
    backgroundImage: `url(${boardLibraryReference})`,
    backgroundPosition: `${board.crop.x}% ${board.crop.y}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${board.crop.size}% auto`
  } as React.CSSProperties;
  return <span className="board-crop" style={cropStyle} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
