import { describe, expect, it, vi } from 'vitest';
import { installSandboxConsole, serializeConsoleValue } from '../src/components/code-canvas/sandbox-console';
import { normalizeBoardNode } from '../shared/contracts/board';
describe('Canvas console and viewport settings', () => {
  it('serializes objects, errors, bigint and circular values without breaking logging', () => {
    const circular: Record<string, unknown> = { n: 1n }; circular.self = circular;
    expect(serializeConsoleValue(circular)).toContain('[Circular]');
    expect(serializeConsoleValue(circular)).toContain('1n');
    expect(serializeConsoleValue(undefined)).toBe('undefined');
    expect(serializeConsoleValue(new Error('sample error'))).toContain('sample error');
    expect(serializeConsoleValue('x'.repeat(5000))).toHaveLength(4000);
    expect(serializeConsoleValue({ get fail() { throw Error('getter'); } })).toBe('[无法序列化的值]');
  });
  it('forwards severity and bounds log floods while retaining native console calls', () => {
    const target = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level => [level, vi.fn()])) as unknown as Console;
    const nativeLog = target.log;
    const report = vi.fn();
    installSandboxConsole(report, target);
    target.warn('warning', { detail: 1 });
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('warning') }));
    for (let i = 0; i < 200; i++) target.log(i);
    expect(report).toHaveBeenCalledTimes(101);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('日志过多') }));
    expect(nativeLog).toHaveBeenCalledTimes(99);
  });
  it('retains saved device sizes and rejects malformed dimensions', () => {
    const node = { id: 'canvas', type: 'canvas', x: 0, y: 0, code: '', framework: 'html' };
    expect(normalizeBoardNode({ ...node, previewWidth: 390, previewHeight: 844 })).toMatchObject({ previewWidth: 390, previewHeight: 844 });
    for (const previewWidth of [0, 10000, NaN, '390', 390.5]) expect(normalizeBoardNode({ ...node, previewWidth })).toBeNull();
    expect(normalizeBoardNode(node)).not.toBeNull();
  });
});
