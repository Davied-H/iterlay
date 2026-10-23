import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BoardStore } from '../electron/storage/board-store';
import { normalizeBoardNode } from '../shared/contracts/board';
import { createIterlayAgentTools } from '../electron/pi-agent-tools';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'iterlay-code-canvas-')); directories.push(dir);
  const store = new BoardStore(dir);
  const board = await store.createBoard('Canvas');
  return { store, board, dir };
}
describe('persistent code Canvas', () => {
  it('round trips all frameworks and rejects invalid persisted code', () => {
    for (const framework of ['html', 'react', 'vue']) expect(normalizeBoardNode({ id: 'c', x: 0, y: 0, type: 'canvas', framework, code: '<h1>你好</h1>' })).not.toBeNull();
    expect(normalizeBoardNode({ id: 'c', x: 0, y: 0, type: 'canvas', framework: 'shell', code: '' })).toBeNull();
    expect(normalizeBoardNode({ id: 'c', x: 0, y: 0, type: 'canvas', framework: 'html', code: 'x'.repeat(100001) })).toBeNull();
  });
  it('persists code across reopen and refuses stale assistant updates', async () => {
    const { store, board, dir } = await fixture();
    const node = await store.writeCanvasNode({ boardId: board.id, framework: 'html', code: '<h1>A</h1>' });
    await store.writeCanvasNode({ boardId: board.id, nodeId: node.id, framework: 'html', expectedCode: node.code, code: '<h1>用户修改</h1>' });
    await expect(store.writeCanvasNode({ boardId: board.id, nodeId: node.id, framework: 'react', expectedCode: node.code, code: 'export default () => null' })).rejects.toThrow('CANVAS_CODE_CONFLICT');
    const reopened = await new BoardStore(dir).getBoard(board.id);
    expect(reopened?.nodes[0]).toMatchObject({ type: 'canvas', code: '<h1>用户修改</h1>', framework: 'html', displayWidth: 680 });
  });
  it('serializes simultaneous edits with only one matching previous code', async () => {
    const { store, board } = await fixture();
    const node = await store.writeCanvasNode({ boardId: board.id, framework: 'vue', code: 'original' });
    const result = await Promise.allSettled(['one', 'two'].map(code => store.writeCanvasNode({ boardId: board.id, nodeId: node.id, framework: 'vue', expectedCode: 'original', code })));
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('keeps AI Canvas writes scoped to the current board', async () => {
    const tools = createIterlayAgentTools('/unused', { boardId: 'current' }, async () => ({}));
    for (const name of ['create_canvas', 'update_canvas']) {
      const tool = tools.find(t => t.name === name)!;
      expect(tool.executionMode).toBe('sequential');
      await expect(tool.execute('call', { boardId: 'other', framework: 'html', code: '' })).rejects.toThrow('只能操作当前画板');
    }
  });
});
