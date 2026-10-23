export type SandboxConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'result';
export interface SandboxConsoleEntry { level: SandboxConsoleLevel; message: string; timestamp: number }
export function serializeConsoleValue(value: unknown): string {
  try {
    if (typeof value === 'string') return value.slice(0, 4000);
    if (value instanceof Error) return (value.stack || value.message).slice(0, 4000);
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return String(value).slice(0, 4000);
    if (value === undefined) return 'undefined';
    const seen = new WeakSet<object>();
    return (JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'bigint') return `${item}n`;
      if (item && typeof item === 'object') { if (seen.has(item)) return '[Circular]'; seen.add(item); }
      return item;
    }, 2) ?? String(value)).slice(0, 4000);
  } catch { return '[无法序列化的值]'; }
}
export function installSandboxConsole(report: (entry: SandboxConsoleEntry) => void, target: Console = console): void {
  let windowStart = Date.now(); let count = 0;
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      count++;
      if (count > 100) {
        if (count === 101) report({ level: 'warn', message: '日志过多，已限制当前秒的输出。', timestamp: now });
        return;
      }
      original(...args);
      report({ level, message: args.slice(0, 10).map(serializeConsoleValue).join(' ').slice(0, 4000), timestamp: now });
    };
  }
}
