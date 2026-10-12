import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Play,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Undo2
} from "lucide-react";
import appIcon from "@/assets/app-icon-default.png";
import boardLibraryReference from "@/assets/board-library-reference.png";
import "./dev-toast-system-preview.css";

type Tone = "neutral" | "success" | "info" | "warning" | "error" | "progress";
type VisualKind = "icon" | "thumb" | "stack" | "copy" | "slots" | "slice" | "credit" | "version";
type GroupId = "instant" | "task" | "resource" | "system";

interface ToastScenario {
  id: string;
  group: GroupId;
  label: string;
  title: string;
  detail?: string;
  tone: Tone;
  visual: VisualKind;
  icon?: React.ReactNode;
  action?: string;
  accessory?: string;
  progress?: number;
  duration: string;
  behavior: string;
}

interface ScenarioGroup {
  id: GroupId;
  name: string;
  description: string;
}

const groups: ScenarioGroup[] = [
  { id: "instant", name: "即时反馈", description: "轻操作与基础状态" },
  { id: "task", name: "生成任务", description: "同一 taskId 原位更新" },
  { id: "resource", name: "素材与文件", description: "保留业务对象与去向" },
  { id: "system", name: "恢复与系统", description: "必须看见的下一步" }
];

const scenarios: ToastScenario[] = [
  {
    id: "saved", group: "instant", label: "保存成功", title: "配置已保存", detail: "更改已同步到当前工作区",
    tone: "success", visual: "icon", icon: <Check />, duration: "2.4s", behavior: "自动消失"
  },
  {
    id: "filled", group: "instant", label: "普通信息", title: "已填入提示词", detail: "可继续编辑后生成",
    tone: "neutral", visual: "icon", icon: <Sparkles />, duration: "2.4s", behavior: "不抢焦点"
  },
  {
    id: "limit", group: "instant", label: "容量提醒", title: "最多引用 4 张参考图", detail: "移除一张后可继续添加",
    tone: "warning", visual: "icon", icon: <TriangleAlert />, accessory: "4 / 4", duration: "4s", behavior: "同类合并"
  },
  {
    id: "read-error", group: "instant", label: "可恢复错误", title: "无法读取这张图片", detail: "文件可能已移动或损坏",
    tone: "error", visual: "icon", icon: <AlertCircle />, action: "重试", duration: "持续", behavior: "错误优先"
  },
  {
    id: "queued", group: "task", label: "任务排队", title: "生成任务已排队", detail: "前方还有 1 个任务",
    tone: "progress", visual: "icon", icon: <Clock3 />, accessory: "排队中", progress: 0.08, duration: "持续", behavior: "使用 taskId"
  },
  {
    id: "generating", group: "task", label: "任务进行中", title: "正在生成 4 张图片", detail: "已完成 3 / 4 · 约 18 秒",
    tone: "progress", visual: "icon", icon: <LoaderCircle />, accessory: "3 / 4", progress: 0.75, action: "后台运行", duration: "持续", behavior: "真实分项进度"
  },
  {
    id: "result", group: "task", label: "生成完成", title: "已生成 4 张图片", detail: "已放入「AURA 灯具」",
    tone: "success", visual: "stack", action: "前往", duration: "5s", behavior: "原位完成"
  },
  {
    id: "partial", group: "task", label: "部分完成", title: "已返回 3 / 4 张", detail: "1 张生成失败，成功结果已保留",
    tone: "warning", visual: "slots", action: "重试 1 张", duration: "8s", behavior: "只重试失败项"
  },
  {
    id: "reference", group: "resource", label: "加入参考图", title: "已加入参考图", detail: "还可以继续添加 1 张",
    tone: "success", visual: "thumb", accessory: "3 / 4", duration: "2.4s", behavior: "1.2s 聚合"
  },
  {
    id: "copied", group: "resource", label: "复制", title: "已复制 2 张图片", detail: "可粘贴到其他应用",
    tone: "success", visual: "copy", accessory: "⌘ V", duration: "2.4s", behavior: "同类计数聚合"
  },
  {
    id: "exported", group: "resource", label: "导出完成", title: "已导出 6 张图片", detail: "Downloads / Iterlay",
    tone: "success", visual: "icon", icon: <Download />, action: "打开", duration: "5s", behavior: "显示末级路径"
  },
  {
    id: "placed", group: "resource", label: "图片放置", title: "图片已加入当前画板", detail: "已放到画布右侧并选中",
    tone: "success", visual: "stack", action: "用作参考图", duration: "5s", behavior: "单一下一步"
  },
  {
    id: "board", group: "resource", label: "导入画板", title: "已导入「夏日情绪板」", detail: "24 张图片",
    tone: "success", visual: "thumb", action: "前往", duration: "5s", behavior: "保留目标对象"
  },
  {
    id: "template", group: "resource", label: "保存模板", title: "模板已保存", detail: "「产品海报 · 轻透版」",
    tone: "success", visual: "icon", icon: <LayoutGrid />, action: "查看", duration: "5s", behavior: "跳转到详情"
  },
  {
    id: "slice", group: "resource", label: "智能切图", title: "已切出 4 张图片", detail: "已放到画布右侧并全部选中",
    tone: "success", visual: "slice", action: "下载 ZIP", duration: "5s", behavior: "结果与下载合并"
  },
  {
    id: "undo", group: "system", label: "可撤销删除", title: "3 张图片已移入回收站", detail: "将在 30 天后自动清理",
    tone: "warning", visual: "icon", icon: <Undo2 />, action: "撤销", progress: 0.68, duration: "8s", behavior: "悬停暂停计时"
  },
  {
    id: "balance", group: "system", label: "余额不足", title: "官方 Provider 余额不足", detail: "Prompt 已为你保留",
    tone: "error", visual: "credit", action: "激活授权", duration: "持续", behavior: "处理后关闭"
  },
  {
    id: "update", group: "system", label: "版本更新", title: "发现新版本", detail: "可稍后查看，不会中断当前工作",
    tone: "info", visual: "version", action: "查看", duration: "6s", behavior: "每版本仅一次"
  }
];

const taskFlow = ["queued", "generating", "result"];

function App(): React.ReactElement {
  const [selectedId, setSelectedId] = useState("result");
  const [replayKey, setReplayKey] = useState(0);
  const [flowRunning, setFlowRunning] = useState(false);
  const timersRef = useRef<number[]>([]);

  const selected = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0],
    [selectedId]
  );

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const chooseScenario = (id: string): void => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setFlowRunning(false);
    setSelectedId(id);
    setReplayKey((value) => value + 1);
  };

  const playTaskFlow = (): void => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    setFlowRunning(true);
    setSelectedId(taskFlow[0]);
    setReplayKey((value) => value + 1);
    timersRef.current = [
      window.setTimeout(() => setSelectedId(taskFlow[1]), 1300),
      window.setTimeout(() => setSelectedId(taskFlow[2]), 3300),
      window.setTimeout(() => setFlowRunning(false), 4800)
    ];
  };

  return (
    <div className="toast-system-app">
      <header className="toast-system-header">
        <div className="toast-system-brand">
          <img src={appIcon} alt="" />
          <strong>Iterlay</strong>
          <i />
          <span>Toast System</span>
          <b>A3</b>
        </div>
        <div className="toast-system-status"><span /> Final direction · 可交互高保真</div>
      </header>

      <main className="toast-system-main">
        <section className="toast-system-intro">
          <div>
            <span className="toast-system-kicker">Notification system / 03</span>
            <h1>一条浮带，承接所有反馈。</h1>
            <p>统一结果、任务、资源与恢复场景。内容与操作分段，状态在原位更新。</p>
          </div>
          <dl className="toast-system-metrics">
            <div><dt>18</dt><dd>业务场景</dd></div>
            <div><dt>4</dt><dd>语义组</dd></div>
            <div><dt>1</dt><dd>主操作上限</dd></div>
            <div><dt>52</dt><dd>基础高度 px</dd></div>
          </dl>
        </section>

        <section className="toast-system-workbench">
          <aside className="toast-scenario-nav" aria-label="Toast 场景列表">
            <div className="toast-scenario-nav-title"><span>场景目录</span><b>{scenarios.length}</b></div>
            {groups.map((group) => (
              <section key={group.id}>
                <header><strong>{group.name}</strong><small>{group.description}</small></header>
                <div>
                  {scenarios.filter((scenario) => scenario.group === group.id).map((scenario) => (
                    <button
                      type="button"
                      className={selected.id === scenario.id ? "is-active" : ""}
                      onClick={() => chooseScenario(scenario.id)}
                      key={scenario.id}
                    >
                      <ToneDot tone={scenario.tone} />
                      <span>{scenario.label}</span>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </aside>

          <div className="toast-demo-column">
            <header className="toast-demo-toolbar">
              <div><span>实时预览</span><strong>{selected.label}</strong></div>
              <div>
                <button type="button" onClick={() => setReplayKey((value) => value + 1)}><RefreshCw /> 重播</button>
                <button type="button" className="toast-flow-button" onClick={playTaskFlow} disabled={flowRunning}>
                  <Play /> {flowRunning ? "播放中" : "播放任务流"}
                </button>
              </div>
            </header>
            <WorkspaceStage scenario={selected} replayKey={replayKey} />
            <div className="toast-anatomy" aria-label="A3 Toast 组件结构">
              <AnatomyItem index="01" title="Visual" detail="状态图标或业务对象" />
              <AnatomyItem index="02" title="Message" detail="发生了什么 + 去向" />
              <AnatomyItem index="03" title="Context" detail="进度、容量或版本" />
              <AnatomyItem index="04" title="Action" detail="唯一明确的下一步" />
            </div>
          </div>
        </section>

        <section className="toast-catalog" aria-labelledby="catalog-title">
          <header>
            <div><span>Complete inventory</span><h2 id="catalog-title">全场景标本</h2></div>
            <p>每个场景都使用相同骨架；只有 Visual、Context 和 Action 按业务变化。</p>
          </header>
          {groups.map((group) => (
            <section className="toast-catalog-group" key={group.id}>
              <div className="toast-catalog-group-title">
                <strong>{group.name}</strong><small>{group.description}</small>
              </div>
              <div className="toast-specimen-grid">
                {scenarios.filter((scenario) => scenario.group === group.id).map((scenario) => (
                  <button type="button" className="toast-specimen" onClick={() => chooseScenario(scenario.id)} key={scenario.id}>
                    <span className="toast-specimen-label"><b>{scenario.label}</b><small>{scenario.duration} · {scenario.behavior}</small></span>
                    <ToastSurface scenario={scenario} catalog />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </section>

        <section className="toast-policy-band">
          <div><span>运行规则</span><h2>安静不是少反馈，而是只在必要时出现。</h2></div>
          <div className="toast-policy-grid">
            <PolicyItem icon={<Layers3 />} title="稳定去重" detail="event + workspaceId + entityId" />
            <PolicyItem icon={<RefreshCw />} title="原位更新" detail="queued → running → terminal" />
            <PolicyItem icon={<AlertCircle />} title="错误优先" detail="恢复型错误不会自动挤出" />
            <PolicyItem icon={<Clock3 />} title="延迟出现" detail="短于 1.2 秒的任务不展示过程态" />
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkspaceStage({ scenario, replayKey }: { scenario: ToastScenario; replayKey: number }): React.ReactElement {
  const thumbs = ["20% 9%", "47% 9%", "73% 9%", "20% 43%", "73% 43%", "47% 75%"];
  return (
    <div className="toast-stage">
      <div className="toast-stage-titlebar">
        <div className="stage-traffic"><i /><i /><i /></div>
        <span>AURA 灯具</span>
        <div><CircleHelp /><MoreHorizontal /></div>
      </div>
      <div className="toast-stage-body">
        <aside className="stage-sidebar">
          <button type="button"><PanelLeft /></button>
          <button type="button" className="is-active"><ImageIcon /></button>
          <button type="button"><Sparkles /></button>
          <span />
          <button type="button"><Menu /></button>
        </aside>
        <div className="stage-canvas">
          <div className="stage-canvas-tools"><span>画布</span><i />83%</div>
          <div className="stage-images">
            {thumbs.map((position, index) => (
              <span
                key={position}
                style={{ backgroundImage: `url(${boardLibraryReference})`, backgroundPosition: position }}
                className={`stage-image stage-image--${index + 1}`}
              />
            ))}
          </div>
          <div className="stage-prompt"><Sparkles /><span>让灯具置于柔和的晨光中…</span><button type="button"><ArrowRight /></button></div>
        </div>
      </div>
      <div className="toast-stage-notice">
        <ToastSurface scenario={scenario} replayKey={replayKey} />
      </div>
    </div>
  );
}

function ToastSurface({ scenario, replayKey = 0, catalog = false }: {
  scenario: ToastScenario;
  replayKey?: number;
  catalog?: boolean;
}): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const surface = (
    <motion.div
      className={`a3-toast a3-toast--${scenario.tone}${catalog ? " is-catalog" : ""}`}
      layout={!reduceMotion && !catalog}
      transition={{ layout: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="a3-toast-row"
          key={scenario.id}
          initial={reduceMotion || catalog ? false : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <ToastVisual scenario={scenario} />
          <span className="a3-toast-copy"><strong>{scenario.title}</strong>{scenario.detail ? <small>{scenario.detail}</small> : null}</span>
          {scenario.accessory ? <span className="a3-toast-accessory">{scenario.accessory}</span> : null}
          {scenario.action ? (
            <span className="a3-toast-action">
              {scenario.id === "undo" ? <Undo2 /> : scenario.id === "balance" ? <KeyRound /> : null}
              {scenario.action}
              {["result", "board", "template", "update"].includes(scenario.id) ? <ChevronRight /> : null}
              {scenario.id === "exported" ? <ExternalLink /> : null}
            </span>
          ) : null}
        </motion.div>
      </AnimatePresence>
      {scenario.progress !== undefined ? (
        <span className="a3-toast-progress" aria-hidden="true">
          <motion.i
            initial={catalog || reduceMotion ? false : { scaleX: 0.04 }}
            animate={{ scaleX: scenario.progress }}
            transition={{ duration: scenario.id === "undo" ? 1.2 : 1.8, ease: "easeInOut" }}
          />
        </span>
      ) : null}
    </motion.div>
  );

  if (catalog) return surface;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={replayKey}
        initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -5, scale: 0.985 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        {surface}
      </motion.div>
    </AnimatePresence>
  );
}

function ToastVisual({ scenario }: { scenario: ToastScenario }): React.ReactElement {
  if (scenario.visual === "thumb") {
    return (
      <span className="a3-toast-thumb" style={{ backgroundImage: `url(${boardLibraryReference})` }}>
        <CheckCircle2 />
      </span>
    );
  }
  if (scenario.visual === "stack") {
    return <span className="a3-toast-stack">{[0, 1, 2].map((index) => <i style={{ backgroundImage: `url(${boardLibraryReference})` }} key={index} />)}</span>;
  }
  if (scenario.visual === "copy") {
    return <span className="a3-toast-visual"><Copy /><i className="a3-visual-badge"><Check /></i></span>;
  }
  if (scenario.visual === "slots") {
    return <span className="a3-toast-slots">{[true, true, true, false].map((done, index) => <i className={done ? "is-done" : ""} key={index}>{done ? <Check /> : "×"}</i>)}</span>;
  }
  if (scenario.visual === "slice") {
    return <span className="a3-toast-slice">{[0, 1, 2, 3].map((index) => <i style={{ backgroundImage: `url(${boardLibraryReference})` }} key={index} />)}</span>;
  }
  if (scenario.visual === "credit") {
    return <span className="a3-toast-credit"><small>当前</small><b>2</b><i>/</i><small>需要</small><b>8</b></span>;
  }
  if (scenario.visual === "version") return <span className="a3-toast-version">v0.2.0</span>;
  return <span className="a3-toast-visual">{scenario.icon ?? <Info />}</span>;
}

function ToneDot({ tone }: { tone: Tone }): React.ReactElement {
  return <i className={`toast-tone-dot toast-tone-dot--${tone}`} />;
}

function AnatomyItem({ index, title, detail }: { index: string; title: string; detail: string }): React.ReactElement {
  return <div><span>{index}</span><p><strong>{title}</strong><small>{detail}</small></p></div>;
}

function PolicyItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }): React.ReactElement {
  return <div className="toast-policy-item"><span>{icon}</span><p><strong>{title}</strong><small>{detail}</small></p></div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
performance.mark("iterlay:startup-shell-ready");
