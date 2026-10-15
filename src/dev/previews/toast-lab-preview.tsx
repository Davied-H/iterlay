import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  KeyRound,
  LayoutGrid,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
  TriangleAlert
} from "lucide-react";
import appIcon from "@/assets/app-icon-default.png";
import boardLibraryReference from "@/assets/board-library-reference.png";
import "./toast-lab-preview.css";

type Tone = "neutral" | "success" | "info" | "warning" | "error" | "progress";
type Density = "compact" | "detail";
type Visual = "icon" | "thumb" | "pair" | "slice";
type TailKind = "context" | "action";
type LabMode = "single" | "morph" | "stack";

interface ToastFeature {
  id: string;
  label: string;
  title: string;
  detail?: string;
  tone: Tone;
  density: Density;
  visual: Visual;
  icon?: React.ReactNode;
  tail?: string;
  tailKind?: TailKind;
  actionIcon?: React.ReactNode;
  progress?: number;
}

const features: ToastFeature[] = [
  {
    id: "saved", label: "保存", title: "配置已保存", tone: "success", density: "compact",
    visual: "icon", icon: <Check />
  },
  {
    id: "copied", label: "复制", title: "已复制图片", tone: "success", density: "compact",
    visual: "icon", icon: <Copy />, tail: "⌘ V", tailKind: "context"
  },
  {
    id: "reference", label: "参考图", title: "已加入参考图", tone: "success", density: "detail",
    visual: "thumb", detail: "还可以继续添加 1 张", tail: "3 / 4", tailKind: "context"
  },
  {
    id: "exported", label: "导出", title: "已导出 6 张图片", tone: "success", density: "compact",
    visual: "icon", icon: <Download />, tail: "打开", tailKind: "action", actionIcon: <ExternalLink />
  },
  {
    id: "pending", label: "生成中", title: "生成仍在继续", detail: "完成后会自动显示", tone: "progress",
    density: "detail", visual: "icon", icon: <LoaderCircle />, tail: "3 / 4", tailKind: "context", progress: 0.72
  },
  {
    id: "result", label: "生成结果", title: "已生成 4 张图片", detail: "AURA 灯具", tone: "success",
    density: "detail", visual: "pair", tail: "前往", tailKind: "action", actionIcon: <ArrowRight />
  },
  {
    id: "partial", label: "部分完成", title: "已生成 3 / 4 张", detail: "成功结果已保留", tone: "warning",
    density: "detail", visual: "icon", icon: <TriangleAlert />, tail: "重试", tailKind: "action", actionIcon: <RefreshCw />
  },
  {
    id: "placed", label: "图片放置", title: "图片已加入当前画板", tone: "success", density: "compact",
    visual: "icon", icon: <ImagePlus />, tail: "用作参考", tailKind: "action"
  },
  {
    id: "template", label: "模板", title: "模板已保存 · 产品海报", tone: "success", density: "compact",
    visual: "icon", icon: <LayoutGrid />, tail: "查看", tailKind: "action", actionIcon: <ChevronRight />
  },
  {
    id: "slice", label: "切图", title: "已切出 4 张图片", detail: "已放到画布右侧", tone: "success",
    density: "detail", visual: "slice", tail: "下载", tailKind: "action", actionIcon: <Download />
  },
  {
    id: "balance", label: "余额", title: "余额不足 · 2 / 8", detail: "Prompt 已保留", tone: "error",
    density: "detail", visual: "icon", icon: <KeyRound />, tail: "激活", tailKind: "action", actionIcon: <ArrowRight />
  },
  {
    id: "update", label: "更新", title: "新版本 v0.2.0", tone: "info", density: "compact",
    visual: "icon", icon: <Sparkles />, tail: "查看", tailKind: "action", actionIcon: <ChevronRight />
  }
];

const morphIds = ["pending", "result", "partial"];
const stackIds = ["exported", "copied", "partial"];

function App(): React.ReactElement {
  const [mode, setMode] = useState<LabMode>("single");
  const [selectedId, setSelectedId] = useState("result");
  const [replayKey, setReplayKey] = useState(0);
  const [morphIndex, setMorphIndex] = useState(0);
  const timersRef = useRef<number[]>([]);

  const selected = useMemo(
    () => features.find((feature) => feature.id === selectedId) ?? features[0],
    [selectedId]
  );
  const morphFeature = useMemo(
    () => features.find((feature) => feature.id === morphIds[morphIndex]) ?? features[0],
    [morphIndex]
  );

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const clearTimers = (): void => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  const chooseMode = (next: LabMode): void => {
    clearTimers();
    setMode(next);
    setReplayKey((value) => value + 1);
    if (next === "morph") playMorph();
  };

  const chooseFeature = (id: string): void => {
    clearTimers();
    setMode("single");
    setSelectedId(id);
    setReplayKey((value) => value + 1);
  };

  const playMorph = (): void => {
    clearTimers();
    setMode("morph");
    setMorphIndex(0);
    setReplayKey((value) => value + 1);
    timersRef.current = [
      window.setTimeout(() => setMorphIndex(1), 1200),
      window.setTimeout(() => setMorphIndex(2), 2800)
    ];
  };

  const replay = (): void => {
    if (mode === "morph") playMorph();
    else setReplayKey((value) => value + 1);
  };

  return (
    <div className="compact-toast-lab">
      <header className="compact-lab-header">
        <div><img src={appIcon} alt="" /><strong>Iterlay</strong><i /><span>Compact Toast Lab</span></div>
        <span className="compact-lab-status"><i />Focused study · v4</span>
      </header>

      <main className="compact-lab-main">
        <section className="compact-lab-intro">
          <div>
            <span>Notification study / 04</span>
            <h1>更小，更准，更安静。</h1>
            <p>三段式微型语法：Visual · Message · Tail。Context 与 Action 永不同时出现。</p>
          </div>
          <div className="compact-lab-measures">
            <span><b>30</b> compact</span><i />
            <span><b>36</b> detail</span><i />
            <span><b>304</b> max-width</span>
          </div>
        </section>

        <section className="compact-lab-controls">
          <div className="compact-mode-switch" role="tablist" aria-label="Toast 动效模式">
            <button role="tab" aria-selected={mode === "single"} className={mode === "single" ? "is-active" : ""} type="button" onClick={() => chooseMode("single")}>单条</button>
            <button role="tab" aria-selected={mode === "morph"} className={mode === "morph" ? "is-active" : ""} type="button" onClick={() => chooseMode("morph")}>状态变形</button>
            <button role="tab" aria-selected={mode === "stack"} className={mode === "stack" ? "is-active" : ""} type="button" onClick={() => chooseMode("stack")}>堆叠</button>
          </div>
          <div className="compact-feature-tabs" aria-label="Toast 特性">
            {features.map((feature) => (
              <button type="button" className={mode === "single" && selected.id === feature.id ? "is-active" : ""} onClick={() => chooseFeature(feature.id)} key={feature.id}>
                {feature.label}
              </button>
            ))}
          </div>
          <button className="compact-replay" type="button" onClick={replay}><Play />重播</button>
        </section>

        <section className={`compact-motion-stage is-${mode}`} aria-label="Toast 动效预览">
          <div className="compact-stage-label">
            <span>{mode === "single" ? "ENTER / EXIT" : mode === "morph" ? "SAME ID MORPH" : "STACK / HOVER"}</span>
            <small>{mode === "single" ? "170ms" : mode === "morph" ? "80ms out · 140ms in" : "180ms"}</small>
          </div>
          <div className="compact-stage-center">
            {mode === "stack" ? (
              <ToastStack replayKey={replayKey} />
            ) : (
              <ToastMotionShell feature={mode === "morph" ? morphFeature : selected} replayKey={replayKey} />
            )}
          </div>
          <div className="compact-stage-timeline" aria-hidden="true">
            <i /><span>appear</span><i /><span>{mode === "morph" ? "update in place" : mode === "stack" ? "hover expands" : "hold"}</span><i /><span>dismiss</span><i />
          </div>
        </section>

        <section className="compact-specimens" aria-labelledby="specimens-title">
          <header><div><span>Current feature set</span><h2 id="specimens-title">业务特性标本</h2></div><p>保留真实下一步，删除装饰性重复。</p></header>
          <div className="compact-specimen-grid">
            {features.map((feature) => (
              <button type="button" className="compact-specimen" onClick={() => chooseFeature(feature.id)} key={feature.id}>
                <span><b>{feature.label}</b><small>{feature.density === "compact" ? "30h" : "36h"}</small></span>
                <CompactToast feature={feature} staticPreview />
              </button>
            ))}
          </div>
        </section>

        <footer className="compact-lab-footer">
          <span><b>Visual</b>14–24px</span><i />
          <span><b>Message</b>1 行 + 可选 detail</span><i />
          <span><b>Tail</b>Context 或 Action</span><i />
          <span><b>Motion</b>无 blur · 无 bounce</span>
        </footer>
      </main>
    </div>
  );
}

function ToastMotionShell({ feature, replayKey }: { feature: ToastFeature; replayKey: number }): React.ReactElement {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={replayKey}
        initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -2, scale: 0.992 }}
        transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
      >
        <CompactToast feature={feature} />
      </motion.div>
    </AnimatePresence>
  );
}

function CompactToast({
  feature,
  staticPreview = false,
  hiddenContent = false
}: {
  feature: ToastFeature;
  staticPreview?: boolean;
  hiddenContent?: boolean;
}): React.ReactElement {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`micro-toast micro-toast--${feature.tone} micro-toast--${feature.density}${feature.tailKind === "action" ? " has-action" : ""}${staticPreview ? " is-static" : ""}${hiddenContent ? " is-stack-back" : ""}`}
      layout={reduceMotion || staticPreview ? false : "size"}
      transition={{ layout: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          className="micro-toast-row"
          key={feature.id}
          initial={reduceMotion || staticPreview ? false : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.14, delay: 0.035, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden={hiddenContent}
        >
          <MicroVisual feature={feature} />
          <span className="micro-toast-copy"><strong>{feature.title}</strong>{feature.detail ? <small>{feature.detail}</small> : null}</span>
          {feature.tail ? (
            <span className={`micro-toast-tail micro-toast-tail--${feature.tailKind ?? "context"}`}>
              {feature.tail}{feature.actionIcon}
            </span>
          ) : null}
        </motion.div>
      </AnimatePresence>
      {feature.progress !== undefined ? <span className="micro-toast-progress"><motion.i initial={staticPreview ? false : { scaleX: 0.05 }} animate={{ scaleX: feature.progress }} transition={{ duration: 1.6, ease: "easeInOut" }} /></span> : null}
    </motion.div>
  );
}

function MicroVisual({ feature }: { feature: ToastFeature }): React.ReactElement {
  if (feature.visual === "thumb") return <span className="micro-visual-thumb" style={{ backgroundImage: `url(${boardLibraryReference})` }} />;
  if (feature.visual === "pair") {
    return <span className="micro-visual-pair"><i style={{ backgroundImage: `url(${boardLibraryReference})` }} /><i style={{ backgroundImage: `url(${boardLibraryReference})` }} /></span>;
  }
  if (feature.visual === "slice") {
    return <span className="micro-visual-slice">{[0, 1, 2, 3].map((index) => <i style={{ backgroundImage: `url(${boardLibraryReference})` }} key={index} />)}</span>;
  }
  return <span className="micro-visual-icon">{feature.icon ?? <AlertCircle />}</span>;
}

function ToastStack({ replayKey }: { replayKey: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const stackFeatures = stackIds.map((id) => features.find((feature) => feature.id === id)!).filter(Boolean);
  return (
    <div
      className="micro-stack"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      tabIndex={0}
      aria-label="通知堆叠，聚焦后展开"
    >
      {stackFeatures.map((feature, index) => (
        <motion.div
          className="micro-stack-item"
          key={`${replayKey}-${feature.id}`}
          initial={{ opacity: 0, y: -5 }}
          animate={{
            opacity: expanded ? 1 : 1 - index * 0.18,
            y: expanded ? index * 46 : index * 7,
            scale: expanded ? 1 : 1 - index * 0.03
          }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{ zIndex: 3 - index }}
        >
          <CompactToast feature={feature} staticPreview hiddenContent={!expanded && index > 0} />
        </motion.div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
performance.mark("iterlay:startup-shell-ready");
