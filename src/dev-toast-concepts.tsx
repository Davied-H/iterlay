import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Command,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Play,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2
} from "lucide-react";
import appIcon from "@/assets/app-icon-default.png";
import boardLibraryReference from "@/assets/board-library-reference.png";
import "./dev-toast-concepts.css";

type ConceptId = "quiet" | "rail" | "signal";
type ScenarioId = "success" | "progress" | "error" | "undo";
type ViewMode = "compare" | ConceptId;

interface ConceptMeta {
  id: ConceptId;
  code: string;
  name: string;
  summary: string;
  strength: string;
  placement: string;
}

const concepts: ConceptMeta[] = [
  {
    id: "quiet",
    code: "A1",
    name: "精密浮带",
    summary: "保留图标块，状态识别最快",
    strength: "辨识最快",
    placement: "顶部居中"
  },
  {
    id: "rail",
    code: "A2",
    name: "语义细线",
    summary: "去掉图标底，压缩到最低视觉重量",
    strength: "最轻量",
    placement: "顶部居中"
  },
  {
    id: "signal",
    code: "A3",
    name: "分段浮带",
    summary: "内容与操作分区，适合结果型通知",
    strength: "操作最清晰",
    placement: "顶部居中"
  }
];

const scenarios: Array<{ id: ScenarioId; label: string }> = [
  { id: "success", label: "生成完成" },
  { id: "progress", label: "任务进行中" },
  { id: "error", label: "可恢复错误" },
  { id: "undo", label: "撤销操作" }
];

const scenarioCopy: Record<ScenarioId, { title: string; detail: string; action?: string }> = {
  success: { title: "已生成 4 张图片", detail: "已放入「AURA 灯具」", action: "查看" },
  progress: { title: "正在生成图片", detail: "第 3 / 4 张 · 约 18 秒", action: "后台运行" },
  error: { title: "生成中断", detail: "网络连接不稳定，提示词已保留", action: "重试" },
  undo: { title: "3 张图片已移入回收站", detail: "将在 30 天后自动清理", action: "撤销" }
};

function App(): React.ReactElement {
  const [scenario, setScenario] = useState<ScenarioId>("success");
  const [view, setView] = useState<ViewMode>("compare");
  const [replayKey, setReplayKey] = useState(0);

  const visibleConcepts = useMemo(
    () => view === "compare" ? concepts : concepts.filter((concept) => concept.id === view),
    [view]
  );

  const selectScenario = (next: ScenarioId): void => {
    setScenario(next);
    setReplayKey((value) => value + 1);
  };

  return (
    <div className="toast-review-app">
      <header className="toast-review-header">
        <div className="toast-review-brand">
          <img src={appIcon} alt="" />
          <span>Iterlay</span>
          <i />
          <strong>Toast 体验提案</strong>
        </div>
        <div className="toast-review-header-meta"><span className="live-dot" /> 可交互高保真</div>
      </header>

      <main className="toast-review-main">
        <section className="toast-review-intro">
          <div className="toast-review-heading">
            <span className="toast-review-kicker">Notification system / 02</span>
            <h1>更安静，也更明确。</h1>
            <p>基于精密浮带母版，只调整状态符号、信息密度与操作分区。</p>
          </div>

          <div className="toast-review-controls">
            <div className="toast-review-control-group">
              <span>场景</span>
              <div className="toast-segmented" role="tablist" aria-label="Toast 场景">
                {scenarios.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scenario === item.id}
                    className={scenario === item.id ? "is-active" : ""}
                    key={item.id}
                    onClick={() => selectScenario(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="toast-replay-button" type="button" onClick={() => setReplayKey((value) => value + 1)}>
              <Play />
              <span>重播动效</span>
            </button>
          </div>
        </section>

        <nav className="toast-view-tabs" aria-label="方案视图">
          <button className={view === "compare" ? "is-active" : ""} type="button" onClick={() => setView("compare")}>并排比较</button>
          {concepts.map((concept) => (
            <button className={view === concept.id ? "is-active" : ""} type="button" key={concept.id} onClick={() => setView(concept.id)}>
              {concept.code} · {concept.name}
            </button>
          ))}
        </nav>

        <section className={`toast-concept-grid${view !== "compare" ? " is-single" : ""}`}>
          {visibleConcepts.map((concept) => (
            <ConceptCard concept={concept} scenario={scenario} replayKey={replayKey} key={concept.id} />
          ))}
        </section>

        <section className="toast-system-band" aria-labelledby="system-title">
          <div className="toast-system-lead">
            <span>全栈共识</span>
            <h2 id="system-title">一个事件，一条通知，一次明确动作。</h2>
          </div>
          <div className="toast-system-flow" aria-label="通知事件处理流程">
            <FlowItem number="01" title="Event" detail="后端只发语义与任务 ID" />
            <ArrowRight aria-hidden="true" />
            <FlowItem number="02" title="Policy" detail="前端负责去重、升级与优先级" />
            <ArrowRight aria-hidden="true" />
            <FlowItem number="03" title="Presenter" detail="同一条通知原位更新" />
          </div>
          <div className="toast-system-rules">
            <RuleItem icon={<Layers3 />} title="去重" detail="同 taskId 只保留一条" />
            <RuleItem icon={<Redo2 />} title="更新" detail="loading → success 原位变形" />
            <RuleItem icon={<AlertCircle />} title="优先级" detail="错误不会被成功消息顶走" />
            <RuleItem icon={<Command />} title="单操作" detail="最多一个主动作" />
          </div>
        </section>
      </main>
    </div>
  );
}

function ConceptCard({ concept, scenario, replayKey }: {
  concept: ConceptMeta;
  scenario: ScenarioId;
  replayKey: number;
}): React.ReactElement {
  return (
    <article className={`toast-concept-card toast-concept-card--${concept.id}`}>
      <header className="toast-concept-header">
        <div className="toast-concept-index">{concept.code}</div>
        <div className="toast-concept-copy">
          <div>
            <h2>{concept.name}</h2>
            {concept.id === "quiet" ? <span className="toast-recommended">推荐</span> : null}
          </div>
          <p>{concept.summary}</p>
        </div>
        <button type="button" title="方案详情"><MoreHorizontal /></button>
      </header>

      <WorkspaceMock>
        <ToastConcept concept={concept.id} scenario={scenario} replayKey={replayKey} />
      </WorkspaceMock>

      <footer className="toast-concept-footer">
        <span><small>优势</small>{concept.strength}</span>
        <span><small>位置</small>{concept.placement}</span>
        <span><small>尺寸</small>{concept.id === "quiet" ? "自适应 · 44h" : concept.id === "rail" ? "自适应 · 42h" : "自适应 · 52h"}</span>
      </footer>
    </article>
  );
}

function WorkspaceMock({ children }: { children: React.ReactNode }): React.ReactElement {
  const thumbs = [
    { x: "20%", y: "9%" },
    { x: "47%", y: "9%" },
    { x: "73%", y: "9%" },
    { x: "20%", y: "43%" },
    { x: "73%", y: "43%" },
    { x: "47%", y: "75%" }
  ];
  return (
    <div className="toast-workspace-mock">
      <div className="toast-workspace-titlebar">
        <div className="mock-traffic"><i /><i /><i /></div>
        <span>AURA 灯具</span>
        <div className="mock-title-actions"><CircleHelp /><MoreHorizontal /></div>
      </div>
      <div className="toast-workspace-body">
        <aside className="mock-sidebar">
          <button type="button"><PanelLeft /></button>
          <button type="button" className="is-active"><ImageIcon /></button>
          <button type="button"><Sparkles /></button>
          <span />
          <button type="button"><Menu /></button>
        </aside>
        <div className="mock-canvas">
          <div className="mock-canvas-toolbar"><span>画布</span><i /> 83%</div>
          <div className="mock-gallery">
            {thumbs.map((thumb, index) => (
              <div
                className={`mock-image mock-image--${index + 1}`}
                key={index}
                style={{ backgroundImage: `url(${boardLibraryReference})`, backgroundPosition: `${thumb.x} ${thumb.y}` }}
              />
            ))}
          </div>
          <div className="mock-prompt"><Sparkles /><span>让灯具置于柔和的晨光中…</span><button type="button"><ArrowRight /></button></div>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToastConcept({ concept, scenario, replayKey }: {
  concept: ConceptId;
  scenario: ScenarioId;
  replayKey: number;
}): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const copy = scenarioCopy[scenario];
  const icon = getScenarioIcon(scenario);
  const motionKey = `${concept}-${scenario}-${replayKey}`;

  if (concept === "quiet") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          className={`concept-toast concept-toast--quiet is-${scenario}`}
          key={motionKey}
          initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.96, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -5, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="quiet-icon">{icon}</span>
          <span className="quiet-copy"><strong>{copy.title}</strong><small>{copy.detail}</small></span>
          {scenario === "progress" ? <ProgressRing /> : null}
          {copy.action ? <button type="button">{copy.action}</button> : null}
        </motion.div>
      </AnimatePresence>
    );
  }

  if (concept === "rail") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          className={`concept-toast concept-toast--rail is-${scenario}`}
          key={motionKey}
          initial={reduceMotion ? false : { opacity: 0, y: -7, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="rail-accent" />
          <span className="rail-icon">{icon}</span>
          <span className="rail-copy"><strong>{copy.title}</strong><small>{copy.detail}</small></span>
          {copy.action ? <button type="button">{copy.action}<ChevronRight /></button> : null}
          {scenario === "progress" ? <motion.i className="rail-progress" initial={{ scaleX: 0.08 }} animate={{ scaleX: 0.75 }} transition={{ duration: 2.8, ease: "easeInOut" }} /> : null}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className={`concept-toast concept-toast--signal is-${scenario}`}
        key={motionKey}
        initial={reduceMotion ? false : { opacity: 0, y: -9, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -5, scale: 0.98 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {scenario === "success" ? <ResultThumb /> : <span className="signal-icon">{icon}</span>}
        <span className="signal-copy"><strong>{copy.title}</strong><small>{copy.detail}</small></span>
          {scenario === "progress" ? <span className="signal-live"><i /> 3 / 4</span> : null}
        {copy.action ? <button type="button">{scenario === "undo" ? <Undo2 /> : null}{copy.action}</button> : null}
      </motion.div>
    </AnimatePresence>
  );
}

function getScenarioIcon(scenario: ScenarioId): React.ReactElement {
  if (scenario === "success") return <Check />;
  if (scenario === "progress") return <LoaderCircle className="is-spinning" />;
  if (scenario === "error") return <AlertCircle />;
  return <RotateCcw />;
}

function ProgressRing(): React.ReactElement {
  return <span className="quiet-progress"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><motion.circle cx="12" cy="12" r="9" initial={{ pathLength: 0.08 }} animate={{ pathLength: 0.75 }} transition={{ duration: 2.8, ease: "easeInOut" }} /></svg><b>3/4</b></span>;
}

function ResultThumb(): React.ReactElement {
  return (
    <span className="signal-result-thumb" style={{ backgroundImage: `url(${boardLibraryReference})` }}>
      <CheckCircle2 />
    </span>
  );
}

function FlowItem({ number, title, detail }: { number: string; title: string; detail: string }): React.ReactElement {
  return <div className="toast-flow-item"><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function RuleItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }): React.ReactElement {
  return <div className="toast-rule-item"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
performance.mark("iterlay:startup-shell-ready");
