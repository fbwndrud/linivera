import { syntheticPng, syntheticWav } from './synthetic-media.js';

export const scopedBinding = (bindingKey, revision, mode = 'fixed', role = bindingKey) => ({ bindingKey, role, resourceId: revision.resourceId, revisionId: revision.revisionId, mode });
export async function chooseScope(host, scopeId, bindings, reason) {
  const current = await host.call('folio_inputs', { op: 'getSelection', scopeId });
  return host.call('folio_inputs', { op: 'select', scopeId, bindings, expectedScopeSelectionRevision: current?.scopeSelectionRevision ?? null,
    actor: 'user', reason, ...host.definitions });
}
export async function prepareScope(host, scopeId, bindingKeys) {
  const current = await host.call('folio_inputs', { op: 'getSelection', scopeId });
  return host.call('folio_inputs', { op: 'prepare', version: 2, scopeId, scopeSelectionRevision: current.scopeSelectionRevision,
    ...(bindingKeys ? { bindingKeys } : {}), ...host.definitions });
}

/** Disposable, synthetic user choices only. */
export async function scopedScenario(host) {
  const { call, json, select } = host;
  await call('folio_init', { title: 'Synthetic scoped continuity', preset: 'picturebook' });
  const scope = ['design', 'face', 'voice', 'prop', 'context-8', 'context-9', 'package-8', 'change', 'iteration', 'request', 'edited-face',
    'project', 'film', 'film-shot-01', 'film-timeline'];
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes: 8 * 1024 * 1024 }],
    ['pipeline', { version: 1, steps: [{ id: 'revise', capability: 'transform' }] }],
    ['policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
    const revision = await json(kind, value, kind); await select(revision); host.definitions[kind + 'RevisionId'] = revision.revisionId;
  }
  async function text(resourceId, bytes, parents = []) {
    const revision = await call('folio_resources', { op: 'propose', resourceId, kind: 'text', parents, owned: { bytes, mediaType: 'text/plain' } });
    await select(revision); return revision;
  }
  async function media(resourceId, bytes, mediaType, parents = []) {
    return call('folio_resources', { op: 'propose', resourceId, kind: 'synthetic-media', parents, owned: { base64: bytes.toString('base64'), mediaType } });
  }
  const design = await text('design', 'Synthetic blue design');
  const face1 = await media('face', syntheticPng(), 'image/png');
  const input = await host.input([design]);
  const operation = await call('folio_operations', { op: 'start', inputSnapshotId: input.inputSnapshotId, idempotencyKey: 'original-face', actor: 'user' });
  await call('folio_operations', { op: 'submit', ...operation, inputSnapshotId: input.inputSnapshotId, resultRevisionIds: [face1.revisionId] });
  await host.approve(operation.operationId, face1.revisionId);
  const face2 = await media('face', syntheticPng(20, 180), 'image/png', [face1.revisionId]); await select(face2);
  const voice = await media('voice', syntheticWav(), 'audio/wav'); await select(voice);
  const prop = await text('prop', 'Synthetic coat is wet on path-main');
  const change = await text('change', 'Synthetic request: change expression, retain voice and coat');
  const context8 = await json('context-8', { version: 1, scopeId: 'episode-8', pathId: 'path-main', timeLabel: 'night', states: [
    { role: 'face', artifactRevisionId: face1.revisionId, status: 'selected', evidenceRevisionIds: [] },
    { role: 'voice', artifactRevisionId: voice.revisionId, status: 'selected', evidenceRevisionIds: [] },
    { role: 'coat', artifactRevisionId: prop.revisionId, status: 'observed', evidenceRevisionIds: [prop.revisionId], value: 'wet' },
    { role: 'missing-prop', status: 'unknown', evidenceRevisionIds: [], unknown: 'No synthetic observation supplied' },
  ] }, 'usage-context');
  const context9 = await json('context-9', { version: 1, scopeId: 'episode-9', pathId: 'path-other', states: [
    { role: 'face', artifactRevisionId: face2.revisionId, status: 'selected', evidenceRevisionIds: [] },
  ] }, 'usage-context');
  const initial8 = await chooseScope(host, 'episode-8', [scopedBinding('face', face1), scopedBinding('voice', voice), scopedBinding('prop', prop), scopedBinding('context', context8)], 'reuse episode-one face in episode eight');
  await chooseScope(host, 'episode-9', [scopedBinding('face', face2, 'global'), scopedBinding('context', context9)], 'use new face on another path');
  return { text, media, design, face1, face2, voice, prop, change, context8, context9, initial8 };
}
