import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
const exec = promisify(execFile);
let directory: string, script: string;
let generated = 0;
let lastGenerationArgs: Record<string, unknown>;
let resolvedBoards = 0;
let lastSliceArgs: Record<string, unknown>;
const configurations: Record<string, unknown>[] = [];
const server = createServer(async (request, response) => {
  if (request.headers.authorization !== 'Bearer ' + 'a'.repeat(32)) { response.writeHead(401).end(); return; }
  let content = ''; for await (const chunk of request) content += chunk;
  const { method, args } = JSON.parse(content);
  let result: unknown;
  switch (method) {
    case 'status': result = { protocolVersion: 1 }; break;
    case 'resolve_generation_board': resolvedBoards++; result = { boardId: 'configured-default' }; break;
    case 'configure_provider': configurations.push(args); result = { providerId: args.providerId, kind: args.kind, authConfigured: Boolean(args.apiKey) }; break;
    case 'get_provider': result = { id: args.providerId, voice: 'nova' }; break;
    case 'list_boards': result = [{ id: 'board', name: 'CLI 创作' }]; break;
    case 'slice_image': lastSliceArgs = args; result = { boardId: args.boardId, nodeIds: ['slice-node'], images: [{ path: '/managed/slice.png', width: 418, height: 418 }] }; break;
    case 'generate_image': lastGenerationArgs = args; generated++; result = { generationId: 'task', status: 'running' }; break;
    case 'get_generation_status': result = args.generationId === 'unknown-task'
      ? { generationId: 'unknown-task', status: 'unknown', error: '远端结果与费用状态待确认' }
      : { generationId: 'task', status: 'succeeded', images: [{ path: '/managed/test.png' }] }; break;
    case 'read_asset': result = { dataUrl: 'data:image/png;base64,aW1hZ2U=' }; break;
    default: response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unsupported operation' })); return;
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result }));
});
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'iterlay-cli-runtime-'));
  script = path.join(directory, 'main.mjs');
  await build({ entryPoints: ['cli/src/main.ts'], bundle: true, platform: 'node', format: 'esm', outfile: script });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  await writeFile(path.join(directory, 'local-api.json'), JSON.stringify({ port: address.port, token: 'a'.repeat(32) }));
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
describe('CLI subprocess workflow', () => {
  it('routes local slicing and exports PNGs without submitting generation', async () => {
    const before = generated;
    const target = path.join(directory, 'slices');
    const run = await exec(process.execPath, [script, 'image', 'slice', '--path', '/managed/sheet.png', '--board', 'board', '--rows', '3', '--columns', '4', '--out', target, '--user-data-path', directory, '--json']);
    expect(lastSliceArgs).toEqual({ sourcePath: '/managed/sheet.png', boardId: 'board', rows: 3, columns: 4 });
    const result = JSON.parse(run.stdout).data;
    expect(result.exportedPaths).toEqual([path.join(target, '1-slice.png')]);
    expect(await readFile(result.exportedPaths[0], 'utf8')).toBe('image');
    await expect(exec(process.execPath, [script, 'image', 'slice', '--path', '/managed/sheet.png', '--board', 'board', '--rows', '3', '--columns', '4', '--out', target, '--user-data-path', directory, '--json'])).rejects.toMatchObject({ stdout: expect.stringContaining('切图已保存到画板') });
    const crops = [{ x: 10, y: 20, width: 30, height: 40 }];
    await exec(process.execPath, [script, 'image', 'slice', '--node', 'node', '--board', 'board', '--crops', JSON.stringify(crops), '--user-data-path', directory, '--json']);
    expect(lastSliceArgs).toEqual({ nodeId: 'node', boardId: 'board', crops });
    expect(generated).toBe(before);
  });
  it('configures video and TTS via environment or stdin without printing credentials', async () => {
    const args = [script, 'providers', 'set', '--kind', 'video', '--provider', 'video', '--type', 'openrouter', '--base-url', 'https://openrouter.ai/api', '--model', 'vendor/video', '--saved-model', 'other', '--default', '--api-key-env', 'ITERLAY_TEST_SECRET', '--user-data-path', directory, '--json'];
    const run = await exec(process.execPath, args, { env: { ...process.env, ITERLAY_TEST_SECRET: 'env-secret-value' } });
    expect(configurations.at(-1)).toMatchObject({ kind: 'video', model: 'vendor/video', models: ['other'], setDefault: true, apiKey: 'env-secret-value' });
    expect(run.stdout + run.stderr).not.toContain('env-secret-value');
    const pending = exec(process.execPath, [script, 'providers', 'set', '--kind', 'audio', '--provider', 'tts', '--base-url', 'https://api.example.com', '--model', 'tts-1', '--voice', 'nova', '--api-key-stdin', '--user-data-path', directory, '--json']);
    pending.child.stdin!.end('stdin-secret-value\n');
    const tts = await pending;
    expect(configurations.at(-1)).toMatchObject({ kind: 'audio', voice: 'nova', apiKey: 'stdin-secret-value' });
    expect(tts.stdout + tts.stderr).not.toContain('stdin-secret-value');
    await exec(process.execPath, [script, 'models', 'set', '--kind', 'audio', '--provider', 'tts', '--model', 'tts-2', '--user-data-path', directory, '--json']);
    expect(configurations.at(-1)).toEqual({ kind: 'audio', action: 'upsert', providerId: 'tts', model: 'tts-2' });
  });
  it('routes show/default/remove and rejects invalid key sources before mutation', async () => {
    const common = ['--user-data-path', directory, '--json'];
    const shown = await exec(process.execPath, [script, 'providers', 'show', 'tts', ...common]);
    expect(JSON.parse(shown.stdout).data).toMatchObject({ id: 'tts', voice: 'nova' });
    for (const action of ['default', 'remove']) {
      await exec(process.execPath, [script, 'providers', action, 'tts', '--kind', 'audio', ...common]);
      expect(configurations.at(-1)).toEqual({ kind: 'audio', action, providerId: 'tts' });
    }
    const count = configurations.length;
    for (const invalid of [['--api-key-env', 'ITERLAY_MISSING_TEST_KEY'], ['--api-key-stdin', '--clear-api-key']]) {
      await expect(exec(process.execPath, [script, 'providers', 'set', '--kind', 'audio', '--provider', 'tts', ...invalid, ...common])).rejects.toMatchObject({ stdout: expect.stringContaining('ok":false') });
    }
    expect(configurations).toHaveLength(count);
  });
  it('waits for generation and exports to a local file, never overwriting by default', async () => {
    const target = path.join(directory, 'output.png');
    const run = await exec(process.execPath, [script, 'image', 'generate', '--prompt', 'test', '--out', target, '--user-data-path', directory, '--json']);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, data: { generationId: 'task', exportedPaths: [target] } });
    expect(await readFile(target, 'utf8')).toBe('image'); expect(generated).toBe(1);
    expect(lastGenerationArgs.boardId).toBe('configured-default');
    await expect(exec(process.execPath, [script, 'tasks', 'wait', 'task', '--out', target, '--user-data-path', directory, '--json'])).rejects.toMatchObject({ stdout: expect.stringContaining('导出失败') });
    expect(generated).toBe(1);
  });
  it('honors an explicit board without resolving the default', async () => {
    const before = resolvedBoards;
    await exec(process.execPath, [script, 'image', 'generate', '--prompt', 'override', '--board', 'explicit', '--async', '--user-data-path', directory, '--json']);
    expect(lastGenerationArgs.boardId).toBe('explicit');
    expect(resolvedBoards).toBe(before);
  });
  it('returns a structured business error without resubmitting the operation', async () => {
    await expect(exec(process.execPath, [script, 'providers', 'list', '--user-data-path', directory, '--json'])).rejects.toMatchObject({ stdout: expect.stringContaining('unsupported operation') });
  });
  it('stops waiting on an unknown remote outcome without exporting or resubmitting', async () => {
    const before = generated;
    await expect(exec(process.execPath, [script, 'tasks', 'wait', 'unknown-task', '--user-data-path', directory, '--json'], { timeout: 5000 }))
      .rejects.toMatchObject({ stdout: expect.stringContaining('远端结果与费用状态待确认') });
    expect(generated).toBe(before);
  });
  it('reports validation errors without exposing a local credential file', async () => {
    const run = await exec(process.execPath, [script, 'tools', 'list', '--json']);
    const names = JSON.parse(run.stdout).data.map((tool: { name: string }) => tool.name);
    expect(names).toContain('generate_image'); expect(names).toContain('list_providers');
    expect(run.stdout).not.toContain('a'.repeat(32));
  });
});
