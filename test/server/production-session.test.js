import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { productionHost } from '../../examples/support/production-host.js';
import { sessionResourceValue } from '../../core/operations/session-records.js';

test('public MCP records session observations and connects the exact retained files through a typed session Resource', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'linivera-session-mcp-')); t.after(() => rm(root, { recursive: true, force: true }));
  const host = await productionHost(root); t.after(() => host.close());
  await host.call('folio_init', { title: 'Synthetic session observations', preset: 'picturebook' });
  const command = await host.json('session-command', { command: 'synthetic left' }, 'session-command');
  const media = await host.call('folio_resources', { op: 'propose', resourceId: 'session-media', kind: 'session-media',
    owned: { bytes: 'synthetic track', mediaType: 'text/plain' } });
  let head = null;
  const append = async (event) => {
    const result = await host.call('folio_operations', { op: 'recordSession', sessionId: 'fixture-session', expectedSessionHead: head, event });
    assert.equal(result.observation, 'host-reported'); head = result.sessionHead;
  };
  await append({ type: 'opened', version: 1, timebase: { unit: 'seconds', origin: 0 } });
  await append({ type: 'command', order: 1, at: 0, revisionId: command.revisionId });
  await append({ type: 'media', trackId: 'video', start: 0, end: 1, revisionId: media.revisionId, contentHash: media.contentHash });
  await append({ type: 'gap', trackId: 'video', start: 1, end: 2, reason: 'Stream was not retained' });
  await host.restart();
  const session = await host.call('folio_operations', { op: 'inspectSession', sessionId: 'fixture-session', sessionHead: head });
  assert.deepEqual(session.sessionHead, head); assert.equal(session.nextCommandOrder, 2); assert.equal(session.restorability, 'unknown');
  const manifest = await host.json('session-record', sessionResourceValue(session), 'session-record');
  const graph = await host.call('folio_resource_query', { op: 'graph' });
  assert.ok(graph.edges.some((edge) => edge.kind === 'session-command' && edge.source === `revision:${manifest.revisionId}` && edge.target === `revision:${command.revisionId}`));
  assert.ok(graph.edges.some((edge) => edge.kind === 'session-artifact' && edge.source === `revision:${manifest.revisionId}` && edge.target === `revision:${media.revisionId}`));
  assert.equal(session.gaps[0].reason, 'Stream was not retained');
});
