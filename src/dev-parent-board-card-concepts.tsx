import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Clock3,
  FileImage,
  FolderOpen,
  Images,
  Layers3,
  MoreHorizontal,
  Play,
  Sparkles,
  UserRound,
  UsersRound
} from "lucide-react";
import rainImage from "@/assets/creative-direction-rain.png";
import architectureImage from "@/assets/creative-direction-architecture.png";
import galleryImage from "@/assets/creative-direction-gallery.png";
import "./dev-parent-board-card-concepts.css";

type ConceptId = "overview" | "cover" | "progress";

const concepts: Array<{ id: ConceptId; label: string; note: string }> = [
  { id: "overview", label: "A · 项目摘要", note: "默认推荐 · 信息完整但保持安静" },
  { id: "cover", label: "B · 视觉封面", note: "视觉优先 · 更适合已有关键画面的项目" },
  { id: "progress", label: "C · 制作进度", note: "流程优先 · 快速识别阶段与待处理项" }
];

const stats = [
  { label: "设定", value: "3", icon: Layers3 },
  { label: "角色", value: "6", icon: UsersRound },
  { label: "片段", value: "12", icon: Play },
  { label: "素材", value: "48", icon: Images }
];

function App(): React.ReactElement {
  const [concept, setConcept] = useState<ConceptId>("overview");
  const active = concepts.find((item) => item.id === concept) ?? concepts[0];

  return (
    <main className="parent-card-review">
      <header className="review-bar">
        <div>
          <strong>父画板 · 漫剧项目卡片</strong>
          <span>{active.note}</span>
        </div>
        <nav aria-label="视觉方案">
          {concepts.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === concept ? "active" : ""}
              aria-pressed={item.id === concept}
              onClick={() => setConcept(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="review-meta">420 × 304 · 100%</span>
      </header>

      <section className="canvas-stage">
        <div className="canvas-label">
          <span>普通画板 / 新国风悬疑短剧</span>
          <small>项目画板</small>
        </div>
        <div className="canvas-selection" aria-hidden />
        {concept === "overview" ? <OverviewCard /> : null}
        {concept === "cover" ? <CoverCard /> : null}
        {concept === "progress" ? <ProgressCard /> : null}
        <div className="canvas-hint">
          <span><i className="hint-dot teal" />漫剧子画板</span>
          <span><i className="hint-dot gray" />普通素材节点</span>
        </div>
      </section>
    </main>
  );
}

function CardHeader({ dark = false }: { dark?: boolean }): React.ReactElement {
  return (
    <header className={`project-card-header${dark ? " dark" : ""}`}>
      <span className="project-icon"><Clapperboard aria-hidden /></span>
      <div className="project-title">
        <div><h1>雨夜来信</h1><span>漫剧项目</span></div>
        <p>新国风悬疑 · 9:16 · 30 秒</p>
      </div>
      <button type="button" className="icon-action" title="更多操作"><MoreHorizontal aria-hidden /></button>
    </header>
  );
}

function OverviewCard(): React.ReactElement {
  return (
    <article className="project-card overview-card">
      <CardHeader />
      <section className="overview-main">
        <div className="cover-stack">
          <img src={rainImage} alt="" />
          <span><FileImage aria-hidden /> 关键画面</span>
        </div>
        <div className="overview-data">
          <div className="status-row">
            <span className="status-badge"><i />角色设定中</span>
            <span className="updated"><Clock3 aria-hidden />刚刚更新</span>
          </div>
          <div className="stat-grid">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label}><Icon aria-hidden /><strong>{value}</strong><span>{label}</span></div>
            ))}
          </div>
          <div className="project-progress">
            <span><strong>制作进度</strong><em>42%</em></span>
            <i><b /></i>
          </div>
        </div>
      </section>
      <footer className="project-card-footer">
        <span className="next-step"><Sparkles aria-hidden />下一步：补全主要角色视觉</span>
        <button type="button">打开画板<ArrowRight aria-hidden /></button>
      </footer>
    </article>
  );
}

function CoverCard(): React.ReactElement {
  return (
    <article className="project-card cover-card">
      <div className="cover-backdrop">
        <img src={rainImage} alt="" />
        <div className="cover-scrim" />
      </div>
      <div className="cover-content">
        <CardHeader dark />
        <section className="cover-copy">
          <span className="status-badge inverse"><i />角色设定中</span>
          <h2>一封迟到十年的信，<br />在暴雨夜重新抵达。</h2>
          <p>新国风悬疑 · 9:16 · 30 秒</p>
        </section>
        <footer className="cover-footer">
          <div className="thumbnail-strip" aria-label="项目预览">
            <img src={rainImage} alt="" />
            <img src={architectureImage} alt="" />
            <img src={galleryImage} alt="" />
            <span>+45</span>
          </div>
          <div className="cover-meta">
            <span>6 角色</span><i /><span>12 片段</span><i /><span>刚刚更新</span>
          </div>
          <button type="button" title="打开漫剧画板"><FolderOpen aria-hidden /></button>
        </footer>
      </div>
    </article>
  );
}

const stages = [
  { label: "故事设定", state: "done" },
  { label: "角色设定", state: "active" },
  { label: "片段拆解", state: "next" },
  { label: "画面生成", state: "next" }
];

function ProgressCard(): React.ReactElement {
  return (
    <article className="project-card progress-card">
      <CardHeader />
      <section className="progress-main">
        <div className="stage-heading">
          <div><span>当前阶段</span><strong>角色设定</strong></div>
          <span className="completion">2 / 6 已完成</span>
        </div>
        <div className="stage-list">
          {stages.map((stage, index) => (
            <div key={stage.label} className={stage.state}>
              <span className="stage-marker">
                {stage.state === "done" ? <Check aria-hidden /> : index + 1}
              </span>
              <span>{stage.label}</span>
              {stage.state === "active" ? <em>进行中</em> : null}
            </div>
          ))}
        </div>
        <div className="attention-row">
          <CircleAlert aria-hidden />
          <span><strong>4 个角色待补充视觉锚点</strong><small>完成后可开始片段拆解</small></span>
          <ChevronRight aria-hidden />
        </div>
      </section>
      <footer className="project-card-footer progress-footer">
        <div className="owner-row">
          <span className="avatar"><UserRound aria-hidden /></span>
          <span>你 · 刚刚更新</span>
        </div>
        <button type="button">继续制作<ArrowRight aria-hidden /></button>
      </footer>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
