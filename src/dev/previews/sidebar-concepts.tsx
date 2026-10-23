import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock3,
  Grid2X2,
  History,
  Image,
  Lightbulb,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RadioTower,
  Search,
  Settings,
  Sparkles,
  Trash2
} from "lucide-react";
import appIconDefault from "@/assets/app-icon-default.png";
import boardLibraryReference from "@/assets/board-library-reference.png";
import "./sidebar-concepts.css";

type ConceptId = "focus" | "compact" | "workspace" | "hybrid";

interface Board {
  id: string;
  name: string;
  crop: [number, number];
  current?: boolean;
  meta: string;
}

const concepts: Array<{ id: ConceptId; name: string; badge: string; description: string }> = [
  {
    id: "focus",
    name: "A · 焦点分层",
    badge: "推荐",
    description: "保留完整功能，重点重做层级、选中态和最近画板密度"
  },
  {
    id: "compact",
    name: "B · 极简导航",
    badge: "最清爽",
    description: "一级导航常驻，画板与低频工具通过弹层按需出现"
  },
  {
    id: "workspace",
    name: "C · 工作区分组",
    badge: "扩展性强",
    description: "把内容组织成可折叠分组，适合后续增加团队与项目空间"
  },
  {
    id: "hybrid",
    name: "D · 融合工作台",
    badge: "本轮方案",
    description: "展开态负责分组管理，收起态负责快速切换，两种密度共享同一导航结构"
  }
];

const boards: Board[] = [
  { id: "13", name: "画板 13", crop: [12, 8], current: true, meta: "刚刚" },
  { id: "sticker", name: "加油表情包｜六种情绪", crop: [30, 18], meta: "18 分钟前" },
  { id: "12", name: "画板 12", crop: [53, 8], meta: "2 小时前" },
  { id: "travel", name: "都市旅游小程序 UI", crop: [68, 36], meta: "昨天" },
  { id: "9", name: "画板 9", crop: [84, 16], meta: "昨天" },
  { id: "poster", name: "黑猫花朵海报", crop: [44, 64], meta: "3 天前" }
];

const nav = [
  { id: "create", label: "创作", icon: Sparkles },
  { id: "boards", label: "画板库", icon: Grid2X2 },
  { id: "assets", label: "素材库", icon: Image },
  { id: "templates", label: "模版库", icon: Archive },
  { id: "ideas", label: "灵感", icon: Lightbulb }
];

function TrafficLights(): React.ReactElement {
  return <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>;
}

function Brand({ wordmark = true }: { wordmark?: boolean }): React.ReactElement {
  return (
    <div className="sidebar-brand">
      <img src={appIconDefault} alt="" />
      {wordmark ? <strong>Iterlay</strong> : null}
    </div>
  );
}

function BoardThumb({ board }: { board: Board }): React.ReactElement {
  return (
    <span
      className="board-thumb"
      style={{
        backgroundImage: `url(${boardLibraryReference})`,
        backgroundPosition: `${board.crop[0]}% ${board.crop[1]}%`
      }}
    />
  );
}

function PrimaryNav({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <nav className="primary-nav" aria-label="主导航">
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} className={item.id === "create" ? "active" : ""} type="button" title={compact ? item.label : undefined}>
            <Icon />
            {!compact ? <span>{item.label}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

function RecentList({ detailed = false, limit = 6 }: { detailed?: boolean; limit?: number }): React.ReactElement {
  return (
    <div className="recent-list">
      {boards.slice(0, limit).map((board) => (
        <button key={board.id} className={board.current ? "current" : ""} type="button">
          <BoardThumb board={board} />
          <span className="board-copy">
            <strong>{board.name}</strong>
            {detailed ? <small>{board.meta}</small> : null}
          </span>
          {board.current ? <i className="current-dot" /> : <MoreHorizontal className="row-more" />}
        </button>
      ))}
    </div>
  );
}

function UtilityRow({
  icon: Icon,
  label,
  suffix
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  suffix?: React.ReactNode;
}): React.ReactElement {
  return (
    <button className="utility-row" type="button">
      <Icon />
      <span>{label}</span>
      {suffix}
    </button>
  );
}

function FocusSidebar(): React.ReactElement {
  return (
    <aside className="sidebar focus-sidebar">
      <TrafficLights />
      <Brand />
      <PrimaryNav />
      <div className="section-rule" />
      <section className="recent-section">
        <header>
          <span>最近画板</span>
          <button type="button" title="查看全部"><ChevronRight /></button>
        </header>
        <RecentList detailed limit={5} />
        <button className="all-boards" type="button">查看全部画板 <span>12</span></button>
      </section>
      <footer className="sidebar-footer">
        <UtilityRow icon={RadioTower} label="在线分享" suffix={<span className="status-live">2</span>} />
        <UtilityRow icon={MoreHorizontal} label="更多" />
        <button className="profile-row" type="button">
          <span className="avatar">D</span>
          <span><strong>Dong</strong><small>个人工作区</small></span>
          <ChevronRight />
        </button>
      </footer>
    </aside>
  );
}

function CompactSidebar(): React.ReactElement {
  return (
    <aside className="sidebar compact-sidebar">
      <TrafficLights />
      <Brand wordmark={false} />
      <PrimaryNav compact />
      <div className="compact-divider" />
      <button className="compact-tool active-board-tool" type="button" title="最近画板"><Clock3 /></button>
      <div className="compact-spacer" />
      <button className="compact-tool" type="button" title="在线分享"><RadioTower /><i /></button>
      <button className="compact-tool" type="button" title="更多"><MoreHorizontal /></button>
      <button className="compact-avatar" type="button" title="账户与设置">D</button>
      <section className="recent-popover">
        <header>
          <div><strong>最近画板</strong><span>12</span></div>
          <button type="button" title="搜索画板"><Search /></button>
        </header>
        <RecentList detailed />
        <button className="popover-all" type="button"><Grid2X2 /> 查看全部画板 <ChevronRight /></button>
      </section>
    </aside>
  );
}

function WorkspaceSidebar(): React.ReactElement {
  return (
    <aside className="sidebar workspace-sidebar">
      <TrafficLights />
      <Brand />
      <button className="create-button" type="button"><Plus /> 创作助手</button>
      <section className="workspace-group">
        <header><span>工作台</span><ChevronDown /></header>
        <PrimaryNav />
      </section>
      <section className="workspace-group boards-group">
        <header><span>我的画板</span><button type="button" title="画板操作"><MoreHorizontal /></button></header>
        <RecentList limit={5} />
        <button className="all-boards inline" type="button"><ChevronRight /> 显示更多</button>
      </section>
      <footer className="workspace-footer">
        <UtilityRow icon={Trash2} label="回收站" suffix={<span className="count">6</span>} />
        <UtilityRow icon={Settings} label="设置" />
        <button className="account-strip" type="button">
          <span className="avatar">D</span>
          <span>个人工作区</span>
          <ChevronRight />
        </button>
      </footer>
    </aside>
  );
}

function HybridSidebar({
  compact,
  recentOpen,
  onCompactChange,
  onRecentOpenChange
}: {
  compact: boolean;
  recentOpen: boolean;
  onCompactChange: (compact: boolean) => void;
  onRecentOpenChange: (open: boolean) => void;
}): React.ReactElement {
  if (compact) {
    return (
      <aside className="sidebar compact-sidebar hybrid-compact-sidebar">
        <TrafficLights />
        <Brand wordmark={false} />
        <PrimaryNav compact />
        <div className="compact-divider" />
        <button
          className={`compact-tool ${recentOpen ? "active-board-tool" : ""}`}
          type="button"
          title="最近画板"
          aria-pressed={recentOpen}
          onClick={() => onRecentOpenChange(!recentOpen)}
        >
          <Clock3 />
        </button>
        <div className="compact-spacer" />
        <button className="compact-tool" type="button" title="在线分享"><RadioTower /><i /></button>
        <button className="compact-tool" type="button" title="更多"><MoreHorizontal /></button>
        <button className="compact-tool" type="button" title="展开侧边栏" onClick={() => onCompactChange(false)}>
          <PanelLeftOpen />
        </button>
        <button className="compact-avatar" type="button" title="账户与设置">D</button>
        {recentOpen ? (
          <section className="recent-popover hybrid-recent-popover">
            <header>
              <div><strong>最近画板</strong><span>12</span></div>
              <button type="button" title="搜索画板"><Search /></button>
            </header>
            <RecentList detailed />
            <button className="popover-all" type="button"><Grid2X2 /> 查看全部画板 <ChevronRight /></button>
          </section>
        ) : null}
      </aside>
    );
  }

  return (
    <aside className="sidebar workspace-sidebar hybrid-sidebar">
      <TrafficLights />
      <div className="hybrid-brand-row">
        <Brand />
        <button type="button" title="收起侧边栏" onClick={() => {
          onRecentOpenChange(false);
          onCompactChange(true);
        }}>
          <PanelLeftClose />
        </button>
      </div>
      <button className="create-button" type="button"><Plus /> 创作助手</button>
      <section className="workspace-group hybrid-workbench-group">
        <header><span>工作台</span><ChevronDown /></header>
        <PrimaryNav />
      </section>
      <section className="workspace-group boards-group">
        <header><span>我的画板</span><button type="button" title="画板操作"><MoreHorizontal /></button></header>
        <RecentList limit={5} />
        <button className="all-boards inline" type="button"><ChevronRight /> 显示更多</button>
      </section>
      <footer className="workspace-footer">
        <UtilityRow icon={RadioTower} label="在线分享" suffix={<span className="status-live">2</span>} />
        <UtilityRow icon={MoreHorizontal} label="更多" />
        <button className="account-strip" type="button">
          <span className="avatar">D</span>
          <span>个人工作区</span>
          <ChevronRight />
        </button>
      </footer>
    </aside>
  );
}

function MainCanvas({ concept, compact = false }: { concept: ConceptId; compact?: boolean }): React.ReactElement {
  return (
    <main className="mock-main">
      <header className="topbar">
        <div><strong>新对话</strong><span>Pi Agent 会先理解需求，确认方案后再生成</span></div>
        <button type="button" title="历史记录"><History /></button>
        <button className="new-chat" type="button"><Plus /> 新对话</button>
      </header>
      <section className="empty-state">
        <span className="spark-box"><Sparkles /></span>
        <h1>今天想创作什么？</h1>
        <p>从一句想法开始。Pi Agent 会补齐关键要求，方案由你确认后再生成。</p>
        <div className="prompt-row">
          <button type="button">画一只机械章鱼在轨道空间站外维修太阳能帆板</button>
          <button type="button">生成一座云海之上的高空研究设施</button>
          <button type="button">用古典油画风格描绘一位树人骑士</button>
        </div>
      </section>
      <section className="composer">
        <span>描述你想创作的内容...</span>
        <div>
          <button type="button"><Plus /> 新建画板 <ChevronDown /></button>
          <button className="send-button" type="button" title="发送">↑</button>
        </div>
      </section>
      <div className="concept-caption">
        <span>{concepts.find((item) => item.id === concept)?.badge}</span>
        {concept === "focus" ? "信息分层最平衡，适合直接替换现状" : null}
        {concept === "compact" ? "最大化主工作区，侧栏只承担切换入口" : null}
        {concept === "workspace" ? "结构清晰，后续可自然扩展团队与项目" : null}
        {concept === "hybrid" ? compact ? "收起态：按分组压缩为图标段" : "展开态：分组管理与快速创作并存" : null}
      </div>
    </main>
  );
}

function App(): React.ReactElement {
  const [concept, setConcept] = useState<ConceptId>("hybrid");
  const [hybridCompact, setHybridCompact] = useState(false);
  const [hybridRecentOpen, setHybridRecentOpen] = useState(false);
  return (
    <div className="review-shell">
      <header className="review-bar">
        <div>
          <strong>侧边栏视觉方案</strong>
          <span>基于当前功能结构的四种整理方向</span>
        </div>
        <nav aria-label="方案切换">
          {concepts.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={concept === item.id ? "true" : undefined}
              onClick={() => {
                setConcept(item.id);
                if (item.id !== "hybrid") setHybridRecentOpen(false);
              }}
            >
              <span>{item.name}</span>
              <small>{item.badge}</small>
            </button>
          ))}
        </nav>
        <p>{concepts.find((item) => item.id === concept)?.description}</p>
      </header>
      <div className={`app-window concept-${concept}`}>
        {concept === "focus" ? <FocusSidebar /> : null}
        {concept === "compact" ? <CompactSidebar /> : null}
        {concept === "workspace" ? <WorkspaceSidebar /> : null}
        {concept === "hybrid" ? (
          <HybridSidebar
            compact={hybridCompact}
            recentOpen={hybridRecentOpen}
            onCompactChange={setHybridCompact}
            onRecentOpenChange={setHybridRecentOpen}
          />
        ) : null}
        <MainCanvas concept={concept} compact={concept === "hybrid" && hybridCompact} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
