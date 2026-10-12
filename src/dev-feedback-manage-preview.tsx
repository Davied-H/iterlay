import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  ExternalLink,
  Filter,
  Gift,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  TicketCheck,
  Users,
  X
} from "lucide-react";
import "./dev-feedback-manage-preview.css";

type Stage = "待评估" | "已采纳" | "开发中" | "已上线";

interface Feedback {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  category: "体验" | "功能" | "增长" | "内容";
  author: string;
  avatar: string;
  date: string;
  reward: number;
  priority?: "高" | "中";
  duplicate?: number;
  owner?: string;
  project?: string;
}

const feedback: Feedback[] = [
  { id: "F-1248", title: "为分享链接增加访问有效期", description: "素材分享常被长期转发，希望可以设置 7 天或 30 天后自动失效。", stage: "待评估", category: "体验", author: "林沐", avatar: "LM", date: "今天 10:24", reward: 0, priority: "高", duplicate: 3 },
  { id: "F-1246", title: "画板素材支持批量标记", description: "一次导入几十张素材后，逐张整理很耗时；希望支持批量选择、添加标签。", stage: "待评估", category: "功能", author: "陈意", avatar: "CY", date: "昨天", reward: 0, duplicate: 1 },
  { id: "F-1245", title: "新建画板时提供行业模板", description: "让首次使用的创作者更快进入可编辑的工作流。", stage: "待评估", category: "增长", author: "周扬", avatar: "ZY", date: "昨天", reward: 0 },
  { id: "F-1238", title: "生成记录增加失败原因与重试建议", description: "失败后不知道应修改什么，希望展示可执行的修复建议。", stage: "已采纳", category: "体验", author: "吴青", avatar: "WQ", date: "7 月 31 日", reward: 50, priority: "高", owner: "王濛", project: "体验改进 Q3" },
  { id: "F-1233", title: "成员邀请完成后奖励双方积分", description: "让邀请流程更有明确回报，也能提高团队协作的启动率。", stage: "已采纳", category: "增长", author: "罗南", avatar: "LN", date: "7 月 30 日", reward: 50, owner: "季然", project: "推荐计划" },
  { id: "F-1229", title: "模板详情页可直接替换封面", description: "不用回到素材库找图，减少一次上下文切换。", stage: "开发中", category: "功能", author: "许辰", avatar: "XC", date: "7 月 28 日", reward: 50, owner: "袁野", project: "模版库 2.0" },
  { id: "F-1216", title: "生成完成通知中直接打开结果", description: "从通知跳转到对应画板和生成组，而非只打开首页。", stage: "开发中", category: "体验", author: "孙晴", avatar: "SQ", date: "7 月 23 日", reward: 50, owner: "季然", project: "工作流提效" },
  { id: "F-1207", title: "素材库增加按尺寸筛选", description: "针对社媒与电商物料快速过滤合适尺寸。", stage: "已上线", category: "功能", author: "郑言", avatar: "ZY", date: "7 月 19 日", reward: 150, owner: "袁野", project: "素材库 2.0" },
  { id: "F-1194", title: "新手引导展示可恢复入口", description: "关闭引导后希望还能从设置重新打开。", stage: "已上线", category: "内容", author: "何柠", avatar: "HN", date: "7 月 12 日", reward: 150, owner: "王濛", project: "新手体验" }
];

const columns: { title: Stage; tint: string }[] = [
  { title: "待评估", tint: "slate" },
  { title: "已采纳", tint: "amber" },
  { title: "开发中", tint: "blue" },
  { title: "已上线", tint: "green" }
];

function App(): React.ReactElement {
  const [selected, setSelected] = useState<Feedback | null>(feedback[0]);
  const [category, setCategory] = useState("全部类型");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("待评估反馈将在 48 小时内完成首次处理");

  const visible = useMemo(() => feedback.filter((feedback) =>
    (category === "全部类型" || feedback.category === category) &&
    `${feedback.title}${feedback.author}${feedback.id}`.toLowerCase().includes(query.toLowerCase())
  ), [category, query]);

  const approve = (): void => {
    if (!selected) return;
    setNotice(`${selected.id} 已采纳，已向 ${selected.author} 发放 50 积分`);
    setSelected({ ...selected, stage: "已采纳", reward: 50, owner: "王濛", project: "待排期" });
  };

  return (
    <div className="feedback-preview">
      <aside className="manage-sidebar">
        <div className="manage-brand"><span className="brand-mark"><Sparkles /></span><strong>Manage</strong></div>
        <nav aria-label="主导航">
          <SidebarItem icon={<LayoutDashboard />} label="总览" />
          <SidebarItem icon={<TicketCheck />} label="反馈管理" active count="18" />
          <SidebarItem icon={<Gift />} label="积分与奖励" />
          <SidebarItem icon={<Users />} label="用户" />
        </nav>
        <div className="sidebar-bottom"><SidebarItem icon={<Settings />} label="设置" /><div className="user-chip"><span>WM</span><div><b>王濛</b><small>管理员</small></div><ChevronDown /></div></div>
      </aside>
      <main className="manage-main">
        <header className="manage-header">
          <button className="mobile-menu" type="button" title="打开导航"><Menu /></button>
          <div className="crumb"><span>Manage</span><i>/</i><strong>反馈管理</strong></div>
          <div className="header-tools"><button type="button" className="icon-button" title="帮助"><CircleHelp /></button><button type="button" className="icon-button notification" title="通知"><Bell /><i /></button></div>
        </header>
        <section className="workspace">
          <div className="page-intro">
            <div><p className="eyebrow">意见激励计划</p><h1>反馈管理</h1><p className="subcopy">让每条有价值的反馈被追踪、被回应，并在落地后获得奖励。</p></div>
            <button className="primary-action" type="button"><Plus /> 新建反馈</button>
          </div>
          <section className="metric-row" aria-label="本月概览">
            <Metric label="本月有效反馈" value="126" detail="较上月 +18%" tone="neutral" />
            <Metric label="采纳率" value="34.1%" detail="目标 30%" tone="green" />
            <Metric label="待处理" value="18" detail="6 条超过 24 小时" tone="amber" />
            <Metric label="已发放积分" value="8,450" detail="本月预算 42%" tone="blue" />
          </section>
          <div className="toolbar">
            <label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索反馈、提议人或编号" /></label>
            <button type="button" className="filter-button"><Filter /> 所有负责人 <ChevronDown /></button>
            <label className="select-wrap"><span className="sr-only">筛选反馈类型</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>全部类型</option><option>体验</option><option>功能</option><option>增长</option><option>内容</option></select><ChevronDown /></label>
            <button type="button" className="icon-button toolbar-more" title="更多筛选"><MoreHorizontal /></button>
          </div>
          <div className="sla-note"><Clock3 /> {notice}<button type="button">查看处理规则 <ExternalLink /></button></div>
          <div className="kanban" aria-label="反馈处理看板">
            {columns.map((column) => {
              const cards = visible.filter((item) => item.stage === column.title);
              return <section className="kanban-column" key={column.title}><header><div><i className={column.tint} /><h2>{column.title}</h2><span>{cards.length}</span></div><button type="button" title={`${column.title} 更多操作`}><MoreHorizontal /></button></header><div className="column-cards">{cards.map((feedback) => <FeedbackCard key={feedback.id} feedback={feedback} selected={selected?.id === feedback.id} onClick={() => setSelected(feedback)} />)}{cards.length === 0 && <div className="empty-column">没有匹配的反馈</div>}</div></section>;
            })}
          </div>
        </section>
      </main>
      {selected && <FeedbackDrawer feedback={selected} onClose={() => setSelected(null)} onApprove={approve} />}
    </div>
  );
}

function SidebarItem({ icon, label, active, count }: { icon: React.ReactNode; label: string; active?: boolean; count?: string }): React.ReactElement { return <button className={`sidebar-item${active ? " active" : ""}`} type="button">{icon}<span>{label}</span>{count && <b>{count}</b>}</button>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }): React.ReactElement { return <article className="metric"><p>{label}</p><strong>{value}</strong><small className={tone}>{detail}</small></article>; }
function FeedbackCard({ feedback, selected, onClick }: { feedback: Feedback; selected: boolean; onClick: () => void }): React.ReactElement { return <button className={`feedback-card${selected ? " selected" : ""}`} type="button" onClick={onClick}><div className="card-top"><span className={`type-chip ${feedback.category}`}>{feedback.category}</span>{feedback.priority && <span className="priority">{feedback.priority}优</span>}<span className="feedback-id">{feedback.id}</span></div><h3>{feedback.title}</h3><p>{feedback.description}</p>{feedback.duplicate && <div className="duplicate"><Users /> {feedback.duplicate} 条相似反馈</div>}<div className="card-footer"><span className="avatar">{feedback.avatar}</span><span>{feedback.author}</span><time>{feedback.date}</time>{feedback.reward > 0 && <b><Gift /> {feedback.reward}</b>}</div></button>; }
function FeedbackDrawer({ feedback, onClose, onApprove }: { feedback: Feedback; onClose: () => void; onApprove: () => void }): React.ReactElement { const canApprove = feedback.stage === "待评估"; return <aside className="detail-drawer"><header><div><span className="drawer-label">反馈详情</span><strong>{feedback.id}</strong></div><button className="icon-button" type="button" title="关闭详情" onClick={onClose}><X /></button></header><div className="drawer-scroll"><div className="drawer-title"><div><span className={`type-chip ${feedback.category}`}>{feedback.category}</span>{feedback.priority && <span className="priority">{feedback.priority}优先级</span>}</div><h2>{feedback.title}</h2><p>{feedback.description}</p></div><section className="feedback-meta"><div><span>提议人</span><b><i className="avatar">{feedback.avatar}</i>{feedback.author}</b></div><div><span>提交时间</span><b>{feedback.date}</b></div><div><span>当前负责人</span><b>{feedback.owner ?? "未分配"}</b></div><div><span>关联项目</span><b>{feedback.project ?? "暂未关联"}</b></div></section>{feedback.duplicate && <button className="similar-link" type="button"><Users /> 查看 {feedback.duplicate} 条相似反馈 <ExternalLink /></button>}<section className="reward-panel"><div><span className="reward-icon"><Gift /></span><div><small>当前奖励</small><strong>{feedback.reward > 0 ? `${feedback.reward} 积分` : "待采纳后发放"}</strong></div></div><p>{feedback.stage === "已上线" ? "上线奖励已完成结算。" : feedback.stage === "待评估" ? "采纳后自动发放 50 积分；上线后再发放 100 积分。" : "反馈状态推进时，系统会自动记录并通知提议人。"}</p></section><section className="timeline"><h3>处理记录</h3><div><i className="done"><Check /></i><p><b>已提交</b><span>{feedback.date} · {feedback.author}</span></p></div><div><i className={feedback.stage === "待评估" ? "current" : "done"}>{feedback.stage === "待评估" ? null : <Check />}</i><p><b>{feedback.stage === "待评估" ? "等待评估" : "已采纳"}</b><span>{feedback.stage === "待评估" ? "请在 48 小时内完成处理" : "已向提议人发放积分"}</span></p></div>{feedback.stage !== "待评估" && <div><i className={feedback.stage === "已采纳" ? "current" : "done"}>{feedback.stage === "已采纳" ? null : <Check />}</i><p><b>{feedback.stage === "已采纳" ? "等待排期" : feedback.stage}</b><span>{feedback.project ?? "关联项目后同步状态"}</span></p></div>}</section></div>{canApprove ? <footer className="drawer-actions"><button type="button" className="secondary-action">不采纳</button><button type="button" className="primary-action" onClick={onApprove}><Check /> 采纳并奖励 50 积分</button></footer> : <footer className="drawer-actions"><button type="button" className="secondary-action">编辑反馈</button><button type="button" className="primary-action">推进至下一阶段</button></footer>}</aside>; }

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
