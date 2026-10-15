import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  LockKeyhole,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Plus,
  Sparkles,
  Type,
  Variable
} from "lucide-react";
import sourceImage from "@/assets/board-library-reference.png";
import "./template-inspector-concepts.css";

type Concept = "focus" | "compare" | "summary";

const concepts: Array<{ id: Concept; label: string; note: string }> = [
  { id: "focus", label: "A1 焦点审阅", note: "规则逐条确认" },
  { id: "compare", label: "A2 对照分组", note: "固定与可变并列" },
  { id: "summary", label: "A3 快速落库", note: "先确认再细改" }
];

const retainedRules = [
  ["视觉系统", "深色界面，以荧光绿作为小面积强调色；卡片使用低对比描边。"],
  ["布局规则", "顶部身份区、中部数据区、下方列表区，底部保留主行动。"],
  ["信息层级", "核心数字为第一焦点，任务状态为第二焦点，说明信息保持低对比。"],
  ["组件质感", "使用细描边和紧凑密度；仅重点卡片出现局部高亮。"]
];

function App(): React.ReactElement {
  const [concept, setConcept] = useState<Concept>("focus");

  return (
    <div className="template-concept-page">
      <header className="template-concept-nav">
        <div className="template-concept-brand"><Sparkles /> 模板检查器方案</div>
        <div className="template-concept-tabs" role="tablist" aria-label="模板检查器方案">
          {concepts.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={concept === item.id} onClick={() => setConcept(item.id)}>
              <span>{item.label}</span><small>{item.note}</small>
            </button>
          ))}
        </div>
        <span className="template-concept-hint">画布内右侧检查器</span>
      </header>
      <main className="template-concept-stage">
        <CanvasShell concept={concept} />
      </main>
    </div>
  );
}

function CanvasShell({ concept }: { concept: Concept }): React.ReactElement {
  return (
    <div className="canvas-shell">
      <aside className="canvas-nav">
        <div className="canvas-brand"><span>i</span></div>
        <button className="canvas-nav-active" title="画板"><Grid3X3 /></button>
        <button title="素材"><ImageIcon /></button>
        <button title="模板"><Layers3 /></button>
        <div className="canvas-nav-spacer" />
        <button title="更多"><MoreHorizontal /></button>
      </aside>
      <section className="canvas-workspace">
        <header className="canvas-toolbar">
          <div className="canvas-crumb"><ArrowLeft /><strong>移动端会员主页</strong><span>已保存</span></div>
          <div className="canvas-tools"><button><Pencil /> 编辑</button><button><Plus /> 创建</button><button><PanelRight /> 检查器</button></div>
        </header>
        <div className="canvas-surface">
          <div className="canvas-rulers canvas-ruler-x" /><div className="canvas-rulers canvas-ruler-y" />
          <div className="source-board">
            <div className="source-board-label"><ImageIcon /> 选中画面 <span>1024 × 1536</span></div>
            <img src={sourceImage} alt="当前选中的画板" />
            <div className="source-board-handles"><i /><i /><i /><i /></div>
          </div>
          <div className="canvas-zoom">100% <ChevronDown /></div>
        </div>
      </section>
      <TemplateInspector concept={concept} />
    </div>
  );
}

function InspectorHeader({ title, detail }: { title: string; detail: string }): React.ReactElement {
  return <header className="inspector-header"><div><h1>{title}</h1><p>{detail}</p></div><button title="关闭检查器"><ChevronRight /></button></header>;
}

function InspectorFooter({ label = "保存模板" }: { label?: string }): React.ReactElement {
  return <footer className="inspector-footer"><button className="inspector-cancel">取消</button><button className="inspector-primary"><Check /> {label}</button></footer>;
}

function RuleRow({ title, body, category = "保留" }: { title: string; body: string; category?: string }): React.ReactElement {
  return <div className="rule-row"><div><strong>{title}</strong><p>{body}</p></div><button className="rule-kind">{category}<ChevronDown /></button></div>;
}

function TemplateInspector({ concept }: { concept: Concept }): React.ReactElement {
  if (concept === "compare") return <CompareInspector />;
  if (concept === "summary") return <SummaryInspector />;
  return <FocusInspector />;
}

function FocusInspector(): React.ReactElement {
  return <aside className="template-inspector inspector-focus">
    <InspectorHeader title="沉淀为模板" detail="从当前选中画面提取规则" />
    <div className="inspector-scroll">
      <div className="inspector-controls">
        <label>提取范围<button>系列模板 <ChevronDown /></button></label>
        <label>模板用途<button>创建图片 <ChevronDown /></button></label>
      </div>
      <section className="inspector-section">
        <div className="inspector-section-title"><h2>模板规则</h2><span>12 条</span></div>
        <div className="rule-tabs"><button className="active"><LockKeyhole /> 保留 <span>6</span></button><button><Variable /> 可变 <span>3</span></button><button><Type /> 忽略 <span>3</span></button></div>
        <div className="rule-list">{retainedRules.map(([title, body]) => <RuleRow key={title} title={title} body={body} />)}</div>
      </section>
      <section className="template-meta"><label>模板名称<input value="深色数据主页" readOnly /></label><label>适用场景<input value="会员、社群和任务类主页" readOnly /></label></section>
    </div>
    <InspectorFooter />
  </aside>;
}

function CompareInspector(): React.ReactElement {
  return <aside className="template-inspector inspector-compare">
    <InspectorHeader title="模板结构" detail="确认哪些内容应在后续创作中替换" />
    <div className="inspector-scroll">
      <div className="compare-summary"><span className="summary-icon"><Layers3 /></span><div><strong>系列模板</strong><p>保持结构与视觉规则，仅替换业务内容。</p></div><button><ChevronDown /></button></div>
      <section className="compare-group"><div className="compare-title"><span><LockKeyhole /> 固定规则</span><small>6</small></div>{retainedRules.slice(0, 3).map(([title, body]) => <button className="compare-rule" key={title}><div><strong>{title}</strong><p>{body}</p></div><ChevronRight /></button>)}</section>
      <section className="compare-group"><div className="compare-title variable"><span><Variable /> 替换内容</span><small>3</small></div><button className="compare-rule"><div><strong>用户信息</strong><p>头像、昵称和身份说明</p></div><ChevronRight /></button><button className="compare-rule"><div><strong>数据指标</strong><p>指标名称、数值与进度</p></div><ChevronRight /></button><button className="compare-rule"><div><strong>列表内容</strong><p>日期、任务与奖励内容</p></div><ChevronRight /></button></section>
      <button className="expand-details"><FileText /> 查看完整提示词 <ChevronRight /></button>
    </div>
    <InspectorFooter label="创建模板" />
  </aside>;
}

function SummaryInspector(): React.ReactElement {
  return <aside className="template-inspector inspector-summary">
    <InspectorHeader title="模板已就绪" detail="先确认摘要，需要时再进入规则编辑" />
    <div className="inspector-scroll">
      <section className="template-preview-card"><div className="template-preview-head"><span className="summary-icon"><Sparkles /></span><button title="更多"><MoreHorizontal /></button></div><h2>深色数据主页</h2><p>适合会员、社群和任务类移动端主页</p><div className="template-preview-tags"><span>创建图片</span><span>系列模板</span></div></section>
      <section className="summary-checklist"><h2>将被保留</h2><div><CircleCheck /> 深色低对比视觉系统</div><div><CircleCheck /> 顶部身份、数据、列表的阅读顺序</div><div><CircleCheck /> 大数字与任务状态的层级</div></section>
      <section className="summary-checklist muted"><h2>将被替换</h2><div><Variable /> 用户信息与数据指标</div><div><Variable /> 列表条目与奖励内容</div></section>
      <button className="edit-rules"><Pencil /> 编辑 12 条模板规则 <ChevronRight /></button>
    </div>
    <InspectorFooter />
  </aside>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
