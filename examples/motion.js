import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { syntheticPng, syntheticWav } from './support/synthetic-media.js';

/** Disposable synthetic user decisions. This is never an approval recipe for an existing work. */
export async function runMotionExample({ keep = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'folio-motion-example-')); const root = join(base, 'work');
  const client = new Client({ name: 'folio-synthetic-motion', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, '..', 'bin', 'folio-mcp.js')], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', (b) => { stderr += String(b); });
  const selections = new Map(); const definitions = {};
  async function call(name, args) {
    const response = await client.callTool({ name, arguments: { root, ...args } }); const body = JSON.parse(response.content[0].text);
    assert.ok(!response.isError, JSON.stringify(body)); return body;
  }
  const graph = () => call('folio_resource_query', { op: 'graph' });
  const propose = (resourceId, value, kind = 'synthetic', parents = []) => call('folio_resources', { op: 'propose', resourceId, kind, parents, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  async function select(r) {
    const chosen = await call('folio_resources', { op: 'decideSource', revisionId: r.revisionId,
      expectedSelectionRevision: selections.get(r.resourceId) ?? null, action: { actor: 'user', type: 'select' } });
    selections.set(r.resourceId, chosen.selectionRevision);
  }
  const read = async (id) => (await call('folio_resources', { op: 'read', revisionId: id })).revision;
  const input = (refs, pipelineRevisionId = definitions.pipelineRevisionId) => call('folio_inputs', { op: 'prepare', ...definitions, pipelineRevisionId, revisionIds: refs.map((r) => r.revisionId) });
  async function approve(operationId, revisionId, selected = true) {
    const r = await read(revisionId);
    const receiptId = await call('folio_operations', { op: 'review', operationId, outputHashes: [r.contentHash], findings: [], reviewer: 'host' });
    await call('folio_operations', { op: 'decide', operationId, receiptId, actor: 'user', action: 'approve', expectedCheckpoint: (await graph()).checkpoint });
    if (selected) await select(r); return r;
  }
  try {
    await client.connect(transport);
    const tools = await client.listTools(); assert.ok(tools.tools.some((t) => t.name === 'folio_motion'));
    await call('folio_init', { title: 'Synthetic resource circulation', preset: 'picturebook' });
    const scope = ['hero', 'pose', 'voice', 'project', 'narration-project', 'film', 'film-shot-01', 'film-timeline', 'narration', 'narration-shot-01', 'narration-timeline'];
    for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
      ['pipeline', { version: 1, steps: [{ id: 'cutout', capability: 'transform' }] }], ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish'] }]]) {
      const r = await propose(kind, value, kind); await select(r); definitions[kind + 'RevisionId'] = r.revisionId;
    }
    const narrationPipeline = await propose('narration-pipeline', { version: 1, steps: [{ id: 'narrate', capability: 'transform' }, { id: 'illustrate', capability: 'transform' }] }, 'pipeline'); await select(narrationPipeline);
    const hero = await propose('hero', { color: 'synthetic-blue' }); await select(hero);
    const pngPath = join(base, 'pose.png'); await writeFile(pngPath, syntheticPng());
    let asset = (await call('folio_assets', { op: 'add', id: 'pose', brief: { description: 'Synthetic colored square' } })).asset;
    asset = (await call('folio_assets', { op: 'put', id: asset.id, expectedRev: asset.rev, path: pngPath, mediaType: 'image/png' })).asset;
    const pose = await call('folio_resources', { op: 'importAsset', assetId: asset.id, expectedRev: asset.rev });
    assert.equal(pose.resourceId, asset.id); assert.equal(pose.contentHash, asset.output.contentHash);
    assert.equal((await call('folio_resources', { op: 'importAsset', assetId: asset.id, expectedRev: asset.rev })).revisionId, pose.revisionId);
    assert.equal((await call('folio_assets', { op: 'get', id: asset.id })).asset.rev, asset.rev);
    const poseInput = await input([hero]);
    const request = await call('folio_operations', { op: 'start', inputSnapshotId: poseInput.inputSnapshotId, idempotencyKey: 'synthetic-pose', actor: 'user' });
    await call('folio_operations', { op: 'submit', ...request, inputSnapshotId: poseInput.inputSnapshotId, resultRevisionIds: [pose.revisionId], reportedTrace: { synthetic: true, actualModelGeneration: false } });
    await approve(request.operationId, pose.revisionId);
    const wavPath = join(base, 'voice.wav'); await writeFile(wavPath, syntheticWav());
    const voice = await call('folio_resources', { op: 'importFile', resourceId: 'voice', kind: 'voice', path: wavPath, mediaType: 'audio/wav' }); await select(voice);
    const spec = { version: 1, outputResourceId: 'film', width: 64, height: 64, fps: 8,
      shots: [{ durationSeconds: 1, backgroundColor: '#eeeeee', layers: [{ revisionId: pose.revisionId, x: 0, y: 16, width: 16, dx: 32, bob: 2 }] }], audio: [] };
    const stages = [];
    for (const [name, pipelineId, audio] of [['film', definitions.pipelineRevisionId, []], ['narration', narrationPipeline.revisionId, [{ role: 'voice', revisionId: voice.revisionId, required: true }]]]) {
      const project = await propose(name === 'film' ? 'project' : 'narration-project', { ...spec, outputResourceId: name, audio }, 'motion-project'); await select(project);
      const sources = [project, pose, ...(audio.length ? [voice] : [])];
      const prepared = await input(sources, pipelineId);
      const args = { inputSnapshotId: prepared.inputSnapshotId, idempotencyKey: name, actor: 'user' };
      assert.equal((await call('folio_motion', { op: 'plan', inputSnapshotId: args.inputSnapshotId })).status, 'ready');
      const rendered = await call('folio_motion', { op: 'render', ...args });
      assert.deepEqual(await call('folio_motion', { op: 'render', ...args }), rendered);
      const shots = [];
      for (const [i, id] of rendered.resultRevisionIds.entries()) shots.push(await approve(rendered.operationIds[i], id));
      const compiled = await call('folio_motion', { op: 'compile', ...args, inputSnapshotId: (await input([...sources, ...shots], pipelineId)).inputSnapshotId, idempotencyKey: name + '-compile' });
      const timeline = await approve(compiled.operationIds[0], compiled.timelineRevisionId);
      const assembly = await input([timeline, ...shots, ...(audio.length ? [voice] : [])], pipelineId);
      const final = await call('folio_motion', { op: 'assemble', ...args, inputSnapshotId: assembly.inputSnapshotId, idempotencyKey: name + '-assemble' });
      assert.equal(final.technical.audio, Boolean(audio.length)); assert.equal(final.creativeReview, 'not-performed');
      const video = await approve(final.operationIds[0], final.resultRevisionIds[0], false);
      stages.push({ video, timeline, shot: shots[0], shotOperationId: rendered.shots[0].operationId });
    }
    const before = await graph();
    assert.equal(before.nodes.filter((n) => n.revisionId === pose.revisionId).length, 1);
    for (const stage of stages) assert.ok(before.edges.some((e) => e.source === 'revision:' + pose.revisionId && e.target === 'operation:' + stage.shotOperationId));
    const replacement = await propose('hero', { color: 'synthetic-green' }, 'synthetic', [hero.revisionId]); await select(replacement);
    const after = await graph();
    for (const stage of stages) for (const r of [stage.shot, stage.timeline, stage.video]) assert.equal(after.nodes.find((n) => n.revisionId === r.revisionId).reviewRequired, true, r.resourceId);
    await call('folio_resource_query', { op: 'refresh' });
    const metadata = await call('folio_resource_query', { op: 'query', resourceId: 'narration' });
    assert.equal(metadata.entries.find((e) => e.role === 'output').reviewRequired, true);
    assert.equal(stderr, '');
    return { synthetic: true, verified: true, actualModelGeneration: false, outputsRetained: keep, workflows: 2, sharedPoseRevisionId: pose.revisionId,
      videos: stages.map((s) => s.video.resourceId), transitiveReviewRequired: true, graphNodes: after.nodes.length, ...(keep ? { root } : {}) };
  } finally { await client.close(); if (!keep) await rm(base, { recursive: true, force: true }); }
}
const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === fileURLToPath(import.meta.url)) runMotionExample({ keep: process.argv.includes('--keep') })
  .then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
