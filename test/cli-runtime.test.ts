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
const server = createServer(async (request, response) => {
  if (request.headers.authorization !== 'Bearer ' + 'a'.repeat(32)) { response.writeHead(401).end(); return; }
  let content = ''; for await (const chunk of request) content += chunk;
  const { method } = JSON.parse(content);
  let result: unknown;
  switch (method) {
    case 'status': result = { protocolVersion: 1 }; break;
    case 'list_boards': result = [{ id: 'board', name: 'CLI 创作' }]; break;
    case 'generate_image': generated++; result = { generationId: 'task', status: 'running' }; break;
    case 'get_generation_status': result = { generationId: 'task', status: 'succeeded', images: [{ path: '/managed/test.png' }] }; break;
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
  it('waits for generation and exports to a local file, never overwriting by default', async () => {
    const target = path.join(directory, 'output.png');
    const run = await exec(process.execPath, [script, 'image', 'generate', '--prompt', 'test', '--out', target, '--user-data-path', directory, '--json']);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, data: { generationId: 'task', exportedPaths: [target] } });
    expect(await readFile(target, 'utf8')).toBe('image'); expect(generated).toBe(1);
    await expect(exec(process.execPath, [script, 'tasks', 'wait', 'task', '--out', target, '--user-data-path', directory, '--json'])).rejects.toMatchObject({ stdout: expect.stringContaining('导出失败') });
    expect(generated).toBe(1);
  });
  it('returns a structured business error without resubmitting the operation', async () => {
    await expect(exec(process.execPath, [script, 'providers', 'list', '--user-data-path', directory, '--json'])).rejects.toMatchObject({ stdout: expect.stringContaining('unsupported operation') });
  });
  it('reports validation errors without exposing a local credential file', async () => {
    const run = await exec(process.execPath, [script, 'tools', 'list', '--json']);
    const names = JSON.parse(run.stdout).data.map((tool: { name: string }) => tool.name);
    expect(names).toContain('generate_image'); expect(names).toContain('list_providers');
    expect(run.stdout).not.toContain('a'.repeat(32));
  });
});
