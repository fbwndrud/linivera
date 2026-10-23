import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** npm must infer the canonical bin from a tarball with several legacy bin aliases. */
export async function verifyPackageEntry({ npmCli, sandbox, tarball, manifest }) {
  const client = new Client({ name: 'synthetic-npx-install', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [npmCli, 'exec', '--yes', '--', `file:${tarball}`], cwd: sandbox, stderr: 'pipe',
    env: { ...process.env, npm_config_cache: join(sandbox, 'cache') } });
  try {
    await client.connect(transport);
    assert.deepEqual(client.getServerVersion(), { name: manifest.name, version: manifest.version });
    const { tools } = await client.listTools();
    assert.equal(tools.length, 23);
    const { resources } = await client.listResources();
    assert.ok(resources.some(r => r.uri === 'linivera://guides/getting-started'));
    const guide = await client.readResource({ uri: 'linivera://guides/getting-started' });
    assert.match(guide.contents[0].text, /Your own work needs your real decision|Only your actual approval/);
    return { inferredBin: 'linivera', connected: true, toolCount: tools.length, bundledGuides: true };
  } finally { await client.close(); }
}
