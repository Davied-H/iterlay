import { afterEach, describe, expect, it, vi } from 'vitest';
import { collaborateSceneAgentWith, type TextTransport } from '../electron/providers/text-assistant';
import { SettingsStore } from '../electron/storage/settings-store';
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
  it('recovers a malformed assistant call and persists exactly one real Canvas node', async () => {
    const { store, board, dir } = await fixture();
    const code = '<main><h1>程序员的一天</h1><button>我来优化一下</button></main>';
    const bridge = vi.fn(async (_userDataPath: string, method: string, args: Record<string, unknown>) => {
      expect(method).toBe('create_canvas');
      return store.writeCanvasNode({ boardId: String(args.boardId), framework: 'html', code: String(args.code) });
    });
    const tools = createIterlayAgentTools(dir, { boardId: board.id }, bridge).filter(tool => tool.name === 'create_canvas');
    const operation = JSON.stringify({ text: '创建网页', toolCalls: [{ name: 'create_canvas', arguments: { boardId: board.id, framework: 'html', code } }] });
    const complete = vi.fn().mockResolvedValueOnce(operation + operation).mockResolvedValueOnce(operation)
      .mockResolvedValueOnce(JSON.stringify({ text: '提交结果', toolCalls: [{ name: 'finish_assistant_result', arguments: {
        result: { message: '网页代码已保存，尚未运行。', intent: 'chat', fields: [] }
      } }] }));
    const transport: TextTransport = { complete, completeStream: async () => { throw new Error('unexpected stream'); } };
    await collaborateSceneAgentWith(transport, { instruction: '这个帮我做成一个网页吧',
      referenceImages: [], currentFields: [], workflowMode: 'generate', assistantSurface: 'canvas-prompt', agentMode: true
    }, undefined, tools, { cwd: dir, agentDir: dir, settings: new SettingsStore(dir).getSettings() });
    expect(bridge).toHaveBeenCalledOnce();
    const reopened = await new BoardStore(dir).getBoard(board.id);
    expect(reopened?.nodes).toHaveLength(1);
    expect(reopened?.nodes[0]).toMatchObject({ type: 'canvas', framework: 'html', code });
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
