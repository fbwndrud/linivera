import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** 실제 stdio 도구로 합성 인터뷰와 작가 결정의 경계를 확인한다. 실제 사용자 결정을 생성하지 않는다. */
export async function runContextExample() {
  const base = await mkdtemp(join(tmpdir(), 'folio-context-example-')); const root = join(base, 'work');
  const repo = dirname(import.meta.dirname);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(repo, 'bin', 'linivera-mcp.js')], cwd: repo, stderr: 'pipe' });
  const client = new Client({ name: 'linivera-synthetic-context', version: '1.0.0' });
  let stderr = ''; transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const call = async (name, args) => {
    const response = await client.callTool({ name, arguments: { root, ...args } });
    const body = JSON.parse(response.content[0].text);
    assert.equal(Boolean(response.isError), false, JSON.stringify(body)); return body;
  };
  try {
    await client.connect(transport);
    await call('folio_init', { title: 'Synthetic lore interview', preset: 'scene' });
    await mkdir(join(root, 'entities', 'character'), { recursive: true });
    await writeFile(join(root, 'entities', 'character', 'hero.md'), '---\nid: hero\nkind: character\nname: Synthetic hero\n---\nSynthetic example character.\n');
    const values = { purpose: 'Synthetic adventure', audience: 'Teen readers', language: 'en', surfaceEase: 'Easy', conceptPacing: 'Gradual', inferenceLoad: 'Moderate', complexityRamp: 'Slow' };
    const answers = Object.entries(values).map(([field, value]) => ({ field, value, raw: `Synthetic author answer: ${value}` }));
    const a = await call('folio_interview', { op: 'answer', expectedRev: null, answers });
    const profile = await call('folio_interview', { op: 'confirm', expectedRev: a.revision, fields: Object.keys(values), confirmation: 'Synthetic fixture author confirmation' });
    assert.deepEqual(profile.pending, []);
    const proposal = await call('folio_lore', { op: 'propose', expectedRev: null, snapshot: {
      evidence: [{ id: 'author-setting', basis: 'author', text: 'The hero wears a blue cloak.' }],
      claims: [{ id: 'cloak', entityId: 'hero', text: 'The hero wears a blue cloak.', status: 'adopted', support: ['author-setting'] }],
      questions: [{ id: 'origin', text: 'The cloak origin is undecided.', required: false }],
    } });
    assert.equal((await call('folio_lore', { op: 'get' })).revision, null);
    const published = await call('folio_lore', { op: 'decide', expectedRev: null, proposalId: proposal.proposalId, action: 'approve', decision: 'Synthetic fixture explicit author adoption' });
    const current = await call('folio_lore', { op: 'get' });
    assert.equal(current.revision, published.revision); assert.equal(current.canon[0].id, 'cloak');
    const repeated = await call('folio_interview', { op: 'context', expectedRev: profile.revision, brief: '원래 Synthetic adventure 브리프' });
    assert.deepEqual(repeated, profile);
    const status = await call('folio_status', {}); assert.equal(status.activeRun, null);
    assert.equal(stderr, '');
    return { synthetic: true, verified: true, outputsRetained: false, canonClaims: current.canon.length, unresolvedOptionalQuestions: current.questions.length, interviewConfirmed: profile.pending.length === 0 };
  } finally { await client.close(); await rm(base, { recursive: true, force: true }); }
}

const invokedPath = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invokedPath === await realpath(fileURLToPath(import.meta.url))) {
  runContextExample().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
