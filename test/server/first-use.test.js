import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openWork } from '../../core/store/work.js';
import { runExamples } from '../../examples/run.js';
import { tempDir } from '../support/fixtures.js';

const cli = join(import.meta.dirname, '../../bin/linivera.js');
test('single package entry connects as MCP and serves only bundled guides', async t => {
  const client = new Client({ name: 'synthetic-first-use', version: '1' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli], stderr: 'pipe' }));
  assert.equal(client.getServerVersion().name, 'linivera');
  assert.equal((await client.listTools()).tools.length, 24);
  assert.match(client.getInstructions().slice(0, 512), /actual user decisions/);
  const { resources } = await client.listResources();
  assert.ok(resources.some(r => r.uri === 'linivera://guides/getting-started'));
  for (const resource of resources) {
    const result = await client.readResource({ uri: resource.uri });
    assert.ok(result.contents[0].text.length > 50);
  }
  for (const uri of ['file:///etc/passwd', 'linivera://guides/../../package.json', 'linivera://guides/getting-started?file=/etc/passwd']) {
    await assert.rejects(client.readResource({ uri }), /Unknown Linivera guide/);
  }
});
test('English defaults work through public CLI and retain an English manuscript', async () => {
  const parent = await tempDir('linivera-en-');
  const out = join(parent, 'new');
  const result = spawnSync(process.execPath, [cli, 'examples', 'story', '--out', out], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.language, 'en');
  assert.deepEqual(body.results[0].committed, ['lantern']);
  const source = (await openWork(join(out, 'story'))).tree.nodes.get('lantern').body;
  assert.match(source, /The library had closed/);
  assert.doesNotMatch(source, /[가-힣]/);
});
test('all English fixture structures finish through MCP; API default stays Korean', async () => {
  const en = await runExamples({ language: 'en', verify: true });
  assert.equal(en.length, 4);
  assert.deepEqual((await runExamples({ names: ['story'], verify: true }))[0].committed, ['mailbox']);
});
test('unsupported example language creates no folder', async () => {
  const out = join(await tempDir('linivera-language-'), 'untouched');
  await assert.rejects(runExamples({ language: 'fr', out }), /choose en or ko/);
  await assert.rejects(access(out), { code: 'ENOENT' });
});
