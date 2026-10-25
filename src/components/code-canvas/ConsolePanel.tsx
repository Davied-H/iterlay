import { useUiText } from "@/i18n";
import { useEffect, useRef, useState } from 'react';
import { Trash2, X, ChevronRight } from 'lucide-react';
import type { SandboxConsoleEntry } from './sandbox-console';
export function ConsolePanel({ entries, running, onExecute, onClear, onClose }: {
  entries: SandboxConsoleEntry[]; running: boolean; onExecute: (expression: string) => void; onClear: () => void; onClose: () => void;
}) {
  const uiText = useUiText();
  const [expression, setExpression] = useState('');
  const [filter, setFilter] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { const element = list.current; if (element) element.scrollTop = element.scrollHeight; }, [entries]);
  return <section className="nodrag nopan nowheel code-canvas__console" aria-label={uiText('Console 调试台')} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <header><strong>Console</strong><input aria-label={uiText('筛选日志')} placeholder={uiText('筛选日志')} value={filter} onChange={e => setFilter(e.target.value)} /><button type="button" aria-label={uiText('清空日志')} title={uiText('清空日志')} onClick={onClear}><Trash2 size={13} /></button><button type="button" aria-label={uiText('关闭 Console')} title={uiText('关闭 Console')} onClick={onClose}><X size={14} /></button></header>
    <div ref={list} className="code-canvas__console-entries" role="log" aria-live="off">
      {entries.length === 0 && <p className="code-canvas__console-empty">{uiText(running ? '暂无日志，可在下方输入表达式调试' : '运行预览后查看日志')}</p>}
      {entries.filter(entry => `${entry.level} ${entry.message}`.toLowerCase().includes(filter.toLowerCase())).map((entry, index) => <div key={index} data-level={entry.level} className="code-canvas__console-entry"><time>{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{entry.level}</span><pre>{entry.message}</pre></div>)}
    </div>
    <form onSubmit={e => { e.preventDefault(); if (expression.trim() && running) { onExecute(expression); setExpression(''); } }}><ChevronRight size={14} /><input aria-label={uiText('Console 表达式')} placeholder={uiText(running ? '在沙盒内执行表达式，按 Enter' : '请先运行预览')} disabled={!running} maxLength={4000} value={expression} onChange={e => setExpression(e.target.value)} /></form>
  </section>;
}
