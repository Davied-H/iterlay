import { CanvasSelectionCountContext } from "../canvas/canvas-selection-context";
import { memo, useContext, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { NodeToolbar, Position, useStore, type NodeProps } from '@xyflow/react';
import { SiHtml5, SiReact, SiVuedotjs } from 'react-icons/si';
import { resolveImageToolbarSide } from '../canvas/image-toolbar-position';
import { Code2, Play, Square, AlignLeft, Terminal, Monitor, Tablet, Smartphone, RotateCw } from 'lucide-react';
import { CANVAS_EDITOR_FLUSH_EVENT, type BoardCanvasNode, type CanvasFramework } from '@shared/types';
import { useUiText } from '@/i18n';
import { translateSourceText } from '@/i18n/ui-text';
import { CANVAS_STARTERS } from './model';
import './code-canvas.css';
import { PreviewViewport } from './PreviewViewport';
import { ConsolePanel } from './ConsolePanel';
import type { SandboxConsoleEntry } from './sandbox-console';
import { formatCanvasCode } from './format-code';
const CodeEditor = lazy(() => import('./CodeEditor')); 
export interface CodeCanvasData extends Record<string, unknown> {
  code: string;
  framework: CanvasFramework;
  title?: string;
  previewWidth?: number;
  previewHeight?: number;
  onChange?: (id: string, patch: Partial<BoardCanvasNode>) => void;
}
const FRAMEWORKS = { html: { label: 'HTML', icon: SiHtml5 }, react: { label: 'React', icon: SiReact }, vue: { label: 'Vue', icon: SiVuedotjs } };
function CodeCanvasNodeComponent({ id, data, selected, dragging }: NodeProps) {
  const uiText = useUiText();
  const hasMultipleSelection = useContext(CanvasSelectionCountContext) > 1;
  const value = data as CodeCanvasData;
  const frame = useRef<HTMLIFrameElement>(null);
  const [hovered, setHovered] = useState(false);
  const hideToolbar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToolbar = () => { if (hideToolbar.current) clearTimeout(hideToolbar.current); setHovered(true); };
  const scheduleHide = () => { if (hideToolbar.current) clearTimeout(hideToolbar.current); hideToolbar.current = setTimeout(() => setHovered(false), 160); };
  useEffect(() => () => { if (hideToolbar.current) clearTimeout(hideToolbar.current); }, []);
  const toolbarPosition = useStore<Position>(state => {
    const node = state.nodeLookup.get(id);
    if (!node) return Position.Top;
    const top = node.internals.positionAbsolute.y * state.transform[2] + state.transform[1];
    return resolveImageToolbarSide(top) === 'bottom' ? Position.Bottom : Position.Top;
  });
  const FrameworkIcon = FRAMEWORKS[value.framework].icon;
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [run, setRun] = useState<{ code: string; framework: CanvasFramework; key: number } | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [entries, setEntries] = useState<SandboxConsoleEntry[]>([]);
  const previewWidth = value.previewWidth ?? 680;
  const previewHeight = value.previewHeight ?? 440;
  function resizePreview(width: number, height: number) {
    const clamp = (size: number) => Math.round(Math.max(240, Math.min(3840, size)));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    value.onChange?.(id, { previewWidth: clamp(width), previewHeight: clamp(height) });
  }
  const [error, setError] = useState('');
  const [, setStatus] = useState('尚未运行');
  const [draft, setDraft] = useState(value.code);
  const draftRef = useRef(draft);
  const current = useRef(value); current.current = value;
  const persisted = useRef(value.code);
  const commit = useCallback(() => {
    if (draftRef.current !== persisted.current) {
      persisted.current = draftRef.current;
      current.current.onChange?.(id, { code: draftRef.current });
    }
  }, [id]);
  useEffect(() => {
    if (value.code !== persisted.current) { persisted.current = value.code; draftRef.current = value.code; setDraft(value.code); }
  }, [value.code]);
  useEffect(() => {
    const handle = setTimeout(commit, 350);
    return () => clearTimeout(handle);
  }, [draft, commit]);
  useEffect(() => {
    window.addEventListener(CANVAS_EDITOR_FLUSH_EVENT, commit);
    return () => { window.removeEventListener(CANVAS_EDITOR_FLUSH_EVENT, commit); commit(); };
  }, [commit]);
  useEffect(() => {
    if (!run) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== 'iterlay-code-sandbox') return;
      if (event.data.type === 'ready') frame.current?.contentWindow?.postMessage({ source: 'iterlay-code-host', code: run.code, framework: run.framework }, '*');
      if (event.data.type === 'running') { clearTimeout(timeout); setStatus('运行中'); }
      if (event.data.type === 'console' && ['log', 'info', 'warn', 'error', 'debug', 'result'].includes(event.data.level) && typeof event.data.message === 'string') {
        setEntries(previous => [...previous.slice(-199), { level: event.data.level, message: event.data.message.slice(0, 4000), timestamp: Date.now() }]);
      }
      if (event.data.type === 'error') { clearTimeout(timeout); const message = String(event.data.message).slice(0, 4000); setError(message); setStatus('运行出错'); setEntries(previous => [...previous.slice(-199), { level: 'error', message, timestamp: Date.now() }]); }
    };
    window.addEventListener('message', receive);
    const timeout = setTimeout(() => {
      const message = translateSourceText('预览启动失败，请停止后重试。若仍为空白，请更新应用。');
      setError(message);
      setEntries(previous => [...previous.slice(-199), { level: 'error', message, timestamp: Date.now() }]);
    }, 15000);
    return () => { window.removeEventListener('message', receive); clearTimeout(timeout); };
  }, [run]);
  function start() { commit(); setEntries([]); setError(''); setStatus('启动中'); setRun({ code: draft, framework: value.framework, key: Date.now() }); setTab('preview'); }
  async function formatCode() {
    const code = draftRef.current;
    const framework = value.framework;
    try {
      const formatted = await formatCanvasCode(code, framework);
      if (draftRef.current !== code || current.current.framework !== framework) return;
      draftRef.current = formatted; setDraft(formatted); commit();
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function changeFramework(framework: CanvasFramework) {
    commit(); setRun(null); setStatus('尚未运行'); setError('');
    // Preserve user code. Only untouched examples switch with the framework.
    const code = draft === CANVAS_STARTERS[value.framework] || !draft.trim() ? CANVAS_STARTERS[framework] : draft;
    persisted.current = code; draftRef.current = code; setDraft(code);
    value.onChange?.(id, { framework, code });
  }
  return <section data-code-canvas-node="" className={`canvas-node-card code-canvas ${selected ? 'canvas-workflow-node--selected' : ''}`} aria-label={uiText('Canvas 代码组件')} onPointerEnter={showToolbar} onPointerLeave={scheduleHide}>
    <header className="code-canvas__header"><Code2 size={14} aria-hidden /><span className="code-canvas__title">{value.title || 'Canvas'}</span><span className="code-canvas__framework" role="img" aria-label={FRAMEWORKS[value.framework].label} title={FRAMEWORKS[value.framework].label}><FrameworkIcon aria-hidden /></span></header>
    <NodeToolbar isVisible={!hasMultipleSelection && !dragging && (Boolean(selected) || hovered)} position={toolbarPosition} offset={10} align="center" className="nodrag nopan nowheel">
      <div className="video-node-toolbar code-canvas__toolbar" role="toolbar" aria-label={uiText('Canvas 操作')} onPointerDown={e => e.stopPropagation()} onPointerEnter={showToolbar} onPointerLeave={scheduleHide}>
        <div className="code-canvas__tabs" role="tablist" aria-label={uiText('Canvas 视图')}>
          {(['code', 'preview'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => {
            if (t === 'preview' && (!run || run.code !== draft || run.framework !== value.framework || error)) start();
            else { commit(); setTab(t); }
          }}>{uiText(t === 'code' ? '代码' : '预览')}</button>)}
        </div>
        <span className="code-canvas__divider" aria-hidden />
        <div className="code-canvas__frameworks" role="group" aria-label={uiText('代码框架')}>
          {(Object.keys(FRAMEWORKS) as CanvasFramework[]).map(framework => {
            const item = FRAMEWORKS[framework]; const Icon = item.icon;
            return <button key={framework} type="button" aria-label={item.label} title={item.label} aria-pressed={value.framework === framework} onClick={() => changeFramework(framework)}><Icon aria-hidden /></button>;
          })}
        </div>
        <span className="code-canvas__divider" aria-hidden />
        {tab === 'code' && <button type="button" aria-label={uiText('格式化代码')} title={uiText('格式化代码 · ⌘/Ctrl Shift F')} onClick={() => void formatCode()}><AlignLeft size={14} aria-hidden /></button>}
        <button type="button" aria-label={uiText('设备尺寸')} title={uiText('设备尺寸')} aria-pressed={deviceOpen} onClick={() => setDeviceOpen(open => !open)}><Monitor size={14} /></button>
        <button type="button" aria-label={uiText('Console 调试台')} title={uiText('Console 调试台')} aria-pressed={consoleOpen} onClick={() => setConsoleOpen(open => !open)}><Terminal size={14} />{entries.some(entry => entry.level === 'error') && <span className="code-canvas__console-dot" />}</button>
        <button
          type="button"
          className="code-canvas__run-toggle"
          aria-label={uiText(run ? '停止运行' : '运行')}
          title={uiText(run ? '停止运行' : '运行 · ⌘/Ctrl Enter')}
          onClick={() => { if (run) { setRun(null); setStatus('已停止'); } else start(); }}
        >
          {run ? <Square size={13} aria-hidden /> : <Play size={13} aria-hidden />}
        </button>
      </div>
    </NodeToolbar>
    {deviceOpen && <div className="nodrag nopan nowheel code-canvas__devices" role="group" aria-label={uiText('预览设备尺寸')} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      {[{ label: '桌面', width: 1280, height: 800, icon: Monitor }, { label: '平板', width: 768, height: 1024, icon: Tablet }, { label: '手机', width: 390, height: 844, icon: Smartphone }].map(device => <button key={device.label} type="button" aria-pressed={previewWidth === device.width && previewHeight === device.height} onClick={() => resizePreview(device.width, device.height)} title={`${device.width} × ${device.height}`}><device.icon size={13} />{uiText(device.label)}</button>)}
      <label>{uiText("宽")}<input key={`width-${previewWidth}`} aria-label={uiText('预览宽度')} type="number" min={240} max={3840} defaultValue={previewWidth} onBlur={event => resizePreview(Number(event.target.value), previewHeight)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
      <span aria-hidden>×</span>
      <label>{uiText("高")}<input key={`height-${previewHeight}`} aria-label={uiText('预览高度')} type="number" min={240} max={3840} defaultValue={previewHeight} onBlur={event => resizePreview(previewWidth, Number(event.target.value))} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
      <button type="button" aria-label={uiText('旋转设备')} title={uiText('横竖屏切换')} onClick={() => resizePreview(previewHeight, previewWidth)}><RotateCw size={13} /></button>
    </div>}
    <div className="nodrag nopan nowheel code-canvas__body" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); start(); } }}>
      {tab === 'code' && <Suspense fallback={<div className="code-canvas__editor-loading">{uiText('正在加载编辑器…')}</div>}><CodeEditor code={draft} framework={value.framework} onChange={code => { draftRef.current = code; setDraft(code); }} onCommit={commit} /></Suspense>}
      {run && <PreviewViewport frame={frame} runKey={run.key} visible={tab === 'preview'} width={previewWidth} height={previewHeight} />}
      {!run && tab === 'preview' && <div className="code-canvas__empty"><Code2 size={24} aria-hidden /><p>{uiText('点击运行，预览你的作品')}</p><span>{uiText('支持 HTML、React JSX 和 Vue 单文件组件')}</span></div>}
    </div>
    {consoleOpen && <ConsolePanel entries={entries} running={Boolean(run)} onClear={() => setEntries([])} onClose={() => setConsoleOpen(false)} onExecute={expression => {
      setEntries(previous => [...previous.slice(-199), { level: 'debug', message: `> ${expression}`, timestamp: Date.now() }]);
      frame.current?.contentWindow?.postMessage({ source: 'iterlay-code-host', type: 'evaluate', expression }, '*');
    }} />}
    {error && !consoleOpen && <pre className="nodrag nopan nowheel code-canvas__error" role="alert">{error}</pre>}
  </section>;
}
export const CodeCanvasNode = memo(CodeCanvasNodeComponent);
