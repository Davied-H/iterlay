import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight,
  Download, Film, Focus, Image as ImageIcon, Layers3, Loader2,
  Maximize2, MoreHorizontal, Pause, Play, Redo2, RotateCcw,
  Settings2, SkipBack, SkipForward, Sparkles, Undo2, Volume2, X, Zap
} from "lucide-react";
import moodboard from "../../../demo-assets/lamp-moodboard.jpg";
import dusk from "../../../demo-assets/lamp-dusk.jpg";
import cover from "../../../demo-assets/aura-cover.jpg";
import studio from "../../../demo-assets/lamp-studio.jpg";
import sage from "../../../demo-assets/lamp-sage.jpg";
import "./video-sequence-preview.css";

type SegmentStatus = "ready" | "stale" | "failed" | "generating";
type Dialog = "generate" | "template" | "export" | null;
interface Frame { id: number; name: string; src: string; }
interface Segment { id: number; prompt: string; duration: number; status: SegmentStatus; version: number; trimStart: number; trimEnd: number; }

const initialFrames: Frame[] = [
  { id: 1, name: "暮色入场", src: dusk },
  { id: 2, name: "产品正面", src: cover },
  { id: 3, name: "柔光细节", src: sage },
  { id: 4, name: "空间远景", src: studio },
  { id: 5, name: "设计拆解", src: moodboard }
];
const initialSegments: Segment[] = [
  { id: 1, prompt: "镜头缓慢向前推进，灯光从微弱逐渐变亮，保持产品结构稳定。", duration: 5, status: "ready", version: 2, trimStart: 0, trimEnd: 5 },
  { id: 2, prompt: "镜头围绕灯具轻微向右环绕，柔和展示材质和边缘高光。", duration: 5, status: "stale", version: 3, trimStart: .2, trimEnd: 4.8 },
  { id: 3, prompt: "自然拉远到完整空间，环境光渐暗，主体保持清晰。", duration: 6, status: "generating", version: 1, trimStart: 0, trimEnd: 6 },
  { id: 4, prompt: "平滑切换到设计拆解视角，镜头保持稳定并突出结构关系。", duration: 5, status: "failed", version: 1, trimStart: 0, trimEnd: 5 }
];

function App(): React.ReactElement {
  const [frames, setFrames] = useState(initialFrames);
  const [segments, setSegments] = useState(initialSegments);
  const [selected, setSelected] = useState<{ type: "frame" | "segment"; id: number }>({ type: "segment", id: 2 });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(7.6);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const totalDuration = useMemo(() => segments.reduce((sum, item) => sum + item.trimEnd - item.trimStart, 0), [segments]);
  const currentSegment = segments.find((item) => item.id === (selected.type === "segment" ? selected.id : Math.max(1, selected.id - 1))) ?? segments[0];
  const previewFrame = frames[Math.min(currentSegment.id, frames.length - 1)] ?? frames[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTime((value) => value >= totalDuration ? 0 : value + .1), 100);
    return () => window.clearInterval(timer);
  }, [playing, totalDuration]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dialog) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [dialog]);

  function moveFrame(id: number, direction: -1 | 1): void {
    setFrames((items) => {
      const index = items.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setSegments((items) => items.map((item) => Math.abs(item.id - id) <= 1 ? { ...item, status: "stale" } : item));
    setToast("顺序已调整，相邻片段需要更新");
  }

  function moveFrameTo(id: number, targetId: number): void {
    if (id === targetId) return;
    setFrames((items) => {
      const from = items.findIndex((item) => item.id === id);
      const to = items.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return items;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSegments((items) => items.map((item) => ({ ...item, status: item.status === "generating" ? item.status : "stale" })));
    setToast("关键帧已重新排序，相关片段需要更新");
  }

  function updateSegment(patch: Partial<Segment>): void {
    if (selected.type !== "segment") return;
    setSegments((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch, status: item.status === "generating" ? item.status : "stale" } : item));
  }

  function startGeneration(): void {
    setDialog(null);
    setSegments((items) => items.map((item) => item.status !== "ready" ? { ...item, status: "generating" } : item));
    setToast("已提交 3 个片段，窗口关闭后仍会继续生成");
  }

  return (
    <main className="vs-app">
      <header className="vs-topbar">
        <div className="vs-title-cluster">
          <IconButton label="返回画布"><ArrowLeft /></IconButton>
          <div className="vs-title"><strong>极简灯具发布片</strong><span>角色分镜画板</span></div>
          <span className="vs-save"><Check /> 已保存</span>
        </div>
        <div className="vs-top-progress"><Sparkles /><span>镜头序列</span><b>{segments.filter((s) => s.status === "ready").length}/{segments.length} 最新</b></div>
        <div className="vs-actions">
          <IconButton label="撤销"><Undo2 /></IconButton><IconButton label="重做"><Redo2 /></IconButton>
          <span className="vs-divider" />
          <button className="vs-secondary vs-template-trigger" onClick={() => setDialog("template")}><Layers3 /> 模板 <ChevronDown /></button>
          <button className="vs-primary" onClick={() => setDialog("generate")}><Zap /> 生成受影响片段 · 3</button>
          <button className="vs-secondary vs-export-trigger" onClick={() => setDialog("export")}><Download /> <span>导出</span></button>
          <IconButton label={inspectorOpen ? "收起属性" : "打开属性"} onClick={() => setInspectorOpen(!inspectorOpen)}><Settings2 /></IconButton>
        </div>
      </header>

      <section className={`vs-workspace${inspectorOpen ? "" : " inspector-closed"}`}>
        <div className="vs-preview-column">
          <div className="vs-stage">
            <div className="vs-stage-tools"><span>片段 {String(currentSegment.id).padStart(2, "0")}</span><IconButton label="适应窗口"><Focus /></IconButton><IconButton label="全屏"><Maximize2 /></IconButton></div>
            <div className="vs-video-frame">
              <img src={previewFrame.src} alt="当前镜头预览" />
              <div className="vs-video-vignette" />
              {currentSegment.status === "stale" ? <span className="vs-preview-badge warning"><AlertTriangle /> 旧版本预览</span> : null}
              {currentSegment.status === "generating" ? <span className="vs-preview-badge ai"><Loader2 /> 正在生成新版本 · 68%</span> : null}
              {currentSegment.status === "failed" ? <span className="vs-preview-badge error"><AlertTriangle /> 上次生成失败</span> : null}
              <button className="vs-big-play" aria-label={playing ? "暂停" : "播放"} onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</button>
            </div>
          </div>
          <Transport playing={playing} setPlaying={setPlaying} time={time} setTime={setTime} total={totalDuration} />
        </div>
        {inspectorOpen ? <Inspector selected={selected} frames={frames} segments={segments} onMove={moveFrame} onSelect={setSelected} onUpdate={updateSegment} onGenerate={() => setDialog("generate")} /> : null}
      </section>

      <Timeline frames={frames} segments={segments} selected={selected} time={time} total={totalDuration} onSelect={setSelected} onMove={moveFrame} onMoveTo={moveFrameTo} onSeek={setTime} />
      {dialog ? <Modal kind={dialog} segments={segments} onClose={() => setDialog(null)} onGenerate={startGeneration} onToast={(message) => { setDialog(null); setToast(message); }} /> : null}
      {toast ? <div className="vs-toast"><Check /> {toast}</div> : null}
    </main>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }): React.ReactElement {
  return <button className="vs-icon" type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function Transport({ playing, setPlaying, time, setTime, total }: { playing: boolean; setPlaying: (value: boolean) => void; time: number; setTime: (value: number) => void; total: number }): React.ReactElement {
  const format = (value: number) => `00:${String(Math.floor(value)).padStart(2, "0")}.${Math.floor(value % 1 * 10)}`;
  return <div className="vs-transport">
    <div className="vs-transport-left"><IconButton label="上一片段"><SkipBack /></IconButton><button className="vs-transport-play" onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</button><IconButton label="下一片段"><SkipForward /></IconButton></div>
    <div className="vs-scrubber"><input aria-label="播放位置" type="range" min="0" max={total} step=".1" value={time} onChange={(event) => setTime(Number(event.target.value))} style={{ "--progress": `${time / total * 100}%` } as React.CSSProperties} /></div>
    <span className="vs-time">{format(time)} <i>/</i> {format(total)}</span><IconButton label="音量"><Volume2 /></IconButton><IconButton label="循环播放"><RotateCcw /></IconButton>
  </div>;
}

function Inspector({ selected, frames, segments, onMove, onSelect, onUpdate, onGenerate }: {
  selected: { type: "frame" | "segment"; id: number }; frames: Frame[]; segments: Segment[];
  onMove: (id: number, direction: -1 | 1) => void; onSelect: (value: { type: "frame" | "segment"; id: number }) => void;
  onUpdate: (patch: Partial<Segment>) => void; onGenerate: () => void;
}): React.ReactElement {
  const segment = segments.find((item) => item.id === selected.id);
  const frame = frames.find((item) => item.id === selected.id);
  return <aside className="vs-inspector">
    <header><div><span>{selected.type === "segment" ? "生成片段" : "关键帧"}</span><strong>{selected.type === "segment" ? `片段 ${String(selected.id).padStart(2, "0")}` : frame?.name}</strong></div><button><MoreHorizontal /></button></header>
    {selected.type === "frame" && frame ? <>
      <section className="vs-frame-detail"><img src={frame.src} alt="" /><div><b>关键帧 {String(frames.indexOf(frame) + 1).padStart(2, "0")}</b><span>来自画板 · 原始素材</span></div></section>
      <section><h3>顺序与关系</h3><div className="vs-order-controls"><button disabled={frames.indexOf(frame) === 0} onClick={() => onMove(frame.id, -1)}><ChevronLeft /> 向前</button><button disabled={frames.indexOf(frame) === frames.length - 1} onClick={() => onMove(frame.id, 1)}>向后 <ChevronRight /></button></div><p className="vs-hint"><AlertTriangle /> 调整后会使相邻片段需要更新</p></section>
      <section><h3>受影响片段</h3><div className="vs-relation-list">{segments.filter((s) => s.id === frame.id || s.id === frame.id - 1).map((s) => <button key={s.id} onClick={() => onSelect({ type: "segment", id: s.id })}><Film /><span>片段 {String(s.id).padStart(2, "0")}</span><Status status={s.status} /></button>)}</div></section>
      <div className="vs-inspector-footer"><button className="vs-secondary"><ImageIcon /> 替换图片</button></div>
    </> : null}
    {selected.type === "segment" && segment ? <>
      <div className={`vs-state-banner ${segment.status}`}><Status status={segment.status} />{segment.status === "stale" ? <small>尾帧素材已更新，需要重新生成</small> : segment.status === "failed" ? <small>服务返回异常，可修改参数后重试</small> : segment.status === "generating" ? <small>新版本预计还需 1 分 20 秒</small> : <small>当前版本与输入一致</small>}</div>
      <section><h3>生成输入</h3><div className="vs-frame-pair"><button onClick={() => onSelect({ type: "frame", id: segment.id })}><img src={frames[segment.id - 1]?.src} /><span>首帧</span></button><i>→</i><button onClick={() => onSelect({ type: "frame", id: segment.id + 1 })}><img src={frames[segment.id]?.src} /><span>尾帧</span></button></div><label className="vs-field"><span>运动描述 <small>{segment.prompt.length}/500</small></span><textarea value={segment.prompt} onChange={(event) => onUpdate({ prompt: event.target.value })} /></label></section>
      <section><h3>生成设置</h3><label className="vs-setting"><span>模型</span><button>Seedance 1.5 Pro <ChevronDown /></button></label><label className="vs-setting"><span>时长</span><select value={segment.duration} onChange={(event) => onUpdate({ duration: Number(event.target.value), trimEnd: Number(event.target.value) })}><option value="5">5 秒</option><option value="6">6 秒</option><option value="10">10 秒</option></select></label><label className="vs-setting"><span>分辨率</span><div className="vs-segments"><button className="active">720p</button><button>1080p</button></div></label><label className="vs-setting"><span>生成声音</span><input type="checkbox" defaultChecked /></label></section>
      <section><h3>剪辑</h3><div className="vs-trim"><label>入点<input type="number" value={segment.trimStart} step=".1" onChange={(e) => onUpdate({ trimStart: Number(e.target.value) })} /></label><label>出点<input type="number" value={segment.trimEnd} step=".1" onChange={(e) => onUpdate({ trimEnd: Number(e.target.value) })} /></label><span>{(segment.trimEnd - segment.trimStart).toFixed(1)}s</span></div></section>
      <section><h3>版本 <small>{segment.version} 个</small></h3><div className="vs-version"><span>v{segment.version}</span><div><b>当前版本</b><small>今天 23:18 · Seedance</small></div><Check /></div></section>
      <div className="vs-inspector-footer"><button className="vs-primary" onClick={onGenerate}><Sparkles /> {segment.status === "failed" ? "重试此片段" : "重新生成此片段"}</button></div>
    </> : null}
  </aside>;
}

function Status({ status }: { status: SegmentStatus }): React.ReactElement {
  const labels = { ready: "最新", stale: "待更新", failed: "失败", generating: "生成中" };
  return <span className={`vs-status ${status}`}>{status === "ready" ? <Check /> : status === "generating" ? <Loader2 /> : <AlertTriangle />}{labels[status]}</span>;
}

function Timeline({ frames, segments, selected, time, total, onSelect, onMove, onMoveTo, onSeek }: {
  frames: Frame[]; segments: Segment[]; selected: { type: "frame" | "segment"; id: number }; time: number; total: number;
  onSelect: (value: { type: "frame" | "segment"; id: number }) => void; onMove: (id: number, direction: -1 | 1) => void; onMoveTo: (id: number, targetId: number) => void; onSeek: (value: number) => void;
}): React.ReactElement {
  return <section className="vs-timeline">
    <header><div><Film /><strong>时间线</strong><span>{frames.length} 个关键帧 · {segments.length} 个片段 · {total.toFixed(1)} 秒</span></div><div><button>−</button><span>100%</span><button>＋</button><button><Maximize2 /> 适配</button></div></header>
    <div className="vs-storyboard" role="list" aria-label="关键帧顺序">
      {frames.map((frame, index) => <React.Fragment key={frame.id}>
        <button draggable onDragStart={(e) => e.dataTransfer.setData("frame", String(frame.id))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onMoveTo(Number(e.dataTransfer.getData("frame")), frame.id)} onKeyDown={(e) => { if (e.altKey && e.key === "ArrowLeft") onMove(frame.id, -1); if (e.altKey && e.key === "ArrowRight") onMove(frame.id, 1); }} className={`vs-frame-chip${selected.type === "frame" && selected.id === frame.id ? " selected" : ""}`} onClick={() => onSelect({ type: "frame", id: frame.id })}><img src={frame.src} /><span>{String(index + 1).padStart(2, "0")}</span><small>{frame.name}</small></button>
        {segments[index] ? <button className={`vs-link-chip ${segments[index].status}${selected.type === "segment" && selected.id === segments[index].id ? " selected" : ""}`} onClick={() => onSelect({ type: "segment", id: segments[index].id })}><i /><span>{segments[index].duration}s</span><Status status={segments[index].status} /><i /></button> : null}
      </React.Fragment>)}
    </div>
    <div className="vs-ruler"><span>0s</span><span>5s</span><span>10s</span><span>15s</span><span>20s</span></div>
    <div className="vs-track" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - rect.left) / rect.width * total); }}>
      <div className="vs-playhead" style={{ left: `${time / total * 100}%` }}><i /></div>
      {segments.map((segment, index) => <button key={segment.id} style={{ flex: segment.trimEnd - segment.trimStart }} className={`vs-clip ${segment.status}${selected.type === "segment" && selected.id === segment.id ? " selected" : ""}`} onClick={(e) => { e.stopPropagation(); onSelect({ type: "segment", id: segment.id }); }}><img src={frames[index + 1]?.src} /><span className="vs-clip-shade" /><div><b>片段 {String(segment.id).padStart(2, "0")}</b><small>{(segment.trimEnd - segment.trimStart).toFixed(1)}s · v{segment.version}</small></div><Status status={segment.status} /><i className="handle left" /><i className="handle right" /></button>)}
    </div>
  </section>;
}

function Modal({ kind, segments, onClose, onGenerate, onToast }: { kind: Exclude<Dialog, null>; segments: Segment[]; onClose: () => void; onGenerate: () => void; onToast: (message: string) => void }): React.ReactElement {
  if (kind === "generate") {
    const targets = segments.filter((item) => item.status !== "ready");
    return <DialogShell title="确认批量生成" icon={<Zap />} onClose={onClose}><div className="vs-cost-summary"><div><span>将生成</span><strong>{targets.length} 个片段</strong></div><div><span>生成时长</span><strong>{targets.reduce((s, x) => s + x.duration, 0)} 秒</strong></div><div><span>预计消耗</span><strong>16 金豆</strong></div><div><span>生成后余额</span><strong>248 金豆</strong></div></div><div className="vs-modal-note"><Sparkles /><span><b>Seedance 1.5 Pro · 720p</b><small>窗口关闭后任务仍会继续，失败片段不会影响其他任务。</small></span></div><div className="vs-job-table">{targets.map((s) => <div key={s.id}><span>片段 {String(s.id).padStart(2, "0")}</span><Status status={s.status} /><span>{s.duration}s</span><b>{s.duration} 金豆</b></div>)}</div><ModalFooter onClose={onClose} action={`确认生成 · ${targets.length}`} onAction={onGenerate} /></DialogShell>;
  }
  if (kind === "template") return <DialogShell title="序列模板" icon={<Layers3 />} onClose={onClose}><div className="vs-template-list"><button className="selected"><span><Film /></span><div><b>产品氛围短片</b><small>5 个槽位 · 4 个片段 · 16:9</small></div><Check /></button><button><span><Film /></span><div><b>角色动作展示</b><small>4 个槽位 · 3 个片段 · 9:16</small></div></button><button><span><Film /></span><div><b>空间环绕镜头</b><small>6 个槽位 · 5 个片段 · 16:9</small></div></button></div><label className="vs-check"><input type="checkbox" defaultChecked /><span>保留当前关键帧映射<small>应用模板会覆盖生成参数，使 3 个片段待更新。</small></span></label><ModalFooter onClose={onClose} action="应用模板" onAction={() => onToast("模板已应用，3 个片段需要更新")} /></DialogShell>;
  return <DialogShell title="导出视频" icon={<Download />} onClose={onClose}><div className="vs-export-form"><label><span>文件名</span><input defaultValue="极简灯具发布片_v1" /></label><label><span>保存位置</span><button>~/Downloads <ChevronDown /></button></label><div><label><span>格式</span><select defaultValue="MP4"><option>MP4</option></select></label><label><span>分辨率</span><select defaultValue="1080p"><option>1080p</option><option>720p</option></select></label></div></div><div className="vs-export-warning"><AlertTriangle /><span><b>3 个片段尚未更新</b><small>建议先生成最新版本再导出，预计额外消耗 16 金豆。</small></span></div><div className="vs-export-meta"><span>预计时长 20.6 秒</span><span>30 fps</span><span>约 42 MB</span></div><ModalFooter onClose={onClose} action="更新并导出" onAction={() => onToast("已加入导出队列，生成完成后自动导出")} /></DialogShell>;
}

function DialogShell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }): React.ReactElement { return <div className="vs-modal-backdrop" onMouseDown={onClose}><div className="vs-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}><header><span>{icon}</span><div><strong>{title}</strong><small>极简灯具发布片</small></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header>{children}</div></div>; }
function ModalFooter({ onClose, action, onAction }: { onClose: () => void; action: string; onAction: () => void }): React.ReactElement { return <footer className="vs-modal-footer"><button className="vs-secondary" onClick={onClose}>取消</button><button className="vs-primary" onClick={onAction}>{action}</button></footer>; }

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
