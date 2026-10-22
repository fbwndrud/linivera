import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedFixture } from './scoped-fixture.js';
import { resourcesTool } from '../../server/tools/resources.js';
import { prepareInput, verifyInput } from '../../core/resources/input-snapshots.js';

const record = (recordType, details) => ({ version: 1, recordType, recordId: 'synthetic-' + recordType, issuer: 'synthetic-partner', observedAt: '2026-10-23T00:00:00Z',
  subjects: [{ role: 'deliverable', hint: 'synthetic artwork' }], evidence: [{ role: 'source-document', hint: 'synthetic evidence' }], details });
const brief = () => record('brief', { requirements: [{ id: 'format', text: 'Keep the synthetic title visible', priority: 'required', evidence: [0] }] });

async function definitions(f, scope, maxInputBytes = 100000) {
  const result = { pipelineRevisionId: f.definitions.pipelineRevisionId };
  for (const [kind, value] of [['profile', { version: 1, scope, maxInputBytes }], ['policy', { version: 1, scope, allowedActions: ['create-candidate'] }]]) {
    const r = await f.resource(kind, value, kind); await f.select(r); result[kind + 'RevisionId'] = r.revisionId;
  }
  return result;
}

test('brief requirements link their evidence and exact deliverable revisions into the next input', async (t) => {
  const f = await scopedFixture(t); const source = await f.resource('brief', brief()); const asset = await f.resource('asset', 'synthetic artwork');
  const evidence = await f.resource('evidence', 'synthetic brief source document');
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'delivery-record' });
  assert.deepEqual(structure.references.map((r) => [r.key, r.role, r.required]), [['/subjects/0/hint', 'deliverable', true], ['/evidence/0/hint', 'source-document', true]]);
  assert.ok(structure.links.some((r) => r.kind === 'record-evidence' && r.source === '/details/requirements/0' && r.target === '/evidence/0'));
  assert.equal(structure.units.find((u) => u.kind === 'brief-requirement').text, 'Keep the synthetic title visible');
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'brief-map', sourceRevisionId: source.revisionId, format: 'delivery-record', structureBindings: [
    { referenceKey: '/subjects/0/hint', revisionId: asset.revisionId }, { referenceKey: '/evidence/0/hint', revisionId: evidence.revisionId }] });
  for (const r of [source, asset, evidence, map]) await f.select(r);
  const scope = ['brief', 'asset', 'evidence', 'brief-map'];
  const snapshot = await prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, scope) });
  assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope));
});

const releaseIdentity = () => ({ platform: 'synthetic-channel', account: 'synthetic-account', externalId: 'post-1' });
const release = () => record('release', { identity: releaseIdentity(), status: 'reported-published', publishedAt: '2026-10-20T00:00:00Z', url: 'https://example.invalid/synthetic-post' });
const performance = () => ({ ...record('performance', { identity: releaseIdentity(), period: { start: '2026-10-20T00:00:00Z', end: '2026-10-22T00:00:00Z',
  asOf: '2026-10-22T12:00:00Z', basis: 'interval' }, metrics: [{ id: 'views', metric: 'video-views', value: 120, unit: 'count', definition: 'Synthetic qualified view', dimensions: [{ name: 'territory', value: 'KR' }], evidence: [0] }] }),
  subjects: [{ role: 'release', hint: 'post-1 release' }] });

test('performance pins an identity-matched release, metric definition and observation window', async (t) => {
  const f = await scopedFixture(t); const releaseSource = await f.resource('release', release());
  const asset = await f.resource('asset', 'synthetic artwork'); const proof = await f.resource('proof', 'synthetic publication receipt and CSV');
  const releaseMap = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'release-map', sourceRevisionId: releaseSource.revisionId, format: 'delivery-record', structureBindings: [
    { referenceKey: '/subjects/0/hint', revisionId: asset.revisionId }, { referenceKey: '/evidence/0/hint', revisionId: proof.revisionId }] });
  const source = await f.resource('performance', performance());
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'delivery-record' });
  const metric = structure.units.find((u) => u.kind === 'performance-metric'); assert.deepEqual([metric.value, metric.unit, metric.definition], [120, 'count', 'Synthetic qualified view']);
  const root = structure.units.find((u) => u.id === '/'); assert.equal(root.period.basis, 'interval'); assert.equal(root.period.asOf, '2026-10-22T12:00:00Z');
  const args = { op: 'normalizeStructure', resourceId: 'performance-map', sourceRevisionId: source.revisionId, format: 'delivery-record' };
  await assert.rejects(resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: asset.revisionId }] }), { code: 'STRUCTURE_INVALID' });
  const map = await resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: releaseMap.revisionId }, { referenceKey: '/evidence/0/hint', revisionId: proof.revisionId }] });
  assert.ok(map.revisionId);
  for (const key of ['platform', 'account', 'externalId']) {
    const mismatch = release(); mismatch.details.identity[key] = 'other'; const foreign = await f.resource('foreign', mismatch);
    const foreignMap = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'foreign-map', sourceRevisionId: foreign.revisionId, format: 'delivery-record', structureBindings: [] });
    await assert.rejects(resourcesTool(f.root, { ...args, structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: foreignMap.revisionId }] }), { code: 'STRUCTURE_INVALID' });
  }
  for (const r of [releaseSource, asset, proof, releaseMap, source, map]) await f.select(r);
  const scope = ['release', 'asset', 'proof', 'release-map', 'performance', 'performance-map'];
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, scope.filter((id) => id !== 'asset')) }), { code: 'INPUT_INVALID' });
  const snapshot = await prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, scope) });
  assert.deepEqual(new Set(snapshot.manifest.resources.map((r) => r.resourceId)), new Set(scope));
  await f.select(await f.resource('proof', 'synthetic corrected analytics export'));
  assert.equal((await verifyInput(f.root, snapshot.inputSnapshotId)).manifest.resources.find((r) => r.resourceId === 'proof').revisionId, proof.revisionId);
});

test('delivery records refuse invalid observation windows, units, evidence indices and contract typos', async (t) => {
  const f = await scopedFixture(t);
  for (const mutate of [
    (v) => { v.details.period.end = v.details.period.start; }, (v) => { v.details.period.asOf = '2026-10-24T00:00:00Z'; },
    (v) => { v.details.period.start = '2026-02-30T00:00:00Z'; }, (v) => { v.details.metrics[0].evidence = [4]; },
    (v) => { v.details.metrics[0].unit = 'currency'; }, (v) => { v.details.metrics[0].currency = 'USD'; },
    (v) => { v.details.metrics[0].dimensions.push({ name: 'territory', value: 'US' }); }, (v) => { v.details.approved = true; },
  ]) {
    const value = performance(); mutate(value); const source = await f.resource('bad', value);
    await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'delivery-record' }), { code: 'STRUCTURE_INVALID' });
  }
});

test('missing brief evidence is retained as an unresolved required slot and forged claims are rejected', async (t) => {
  const f = await scopedFixture(t); const value = brief(); value.evidence = []; value.details.requirements[0].evidence = [];
  const source = await f.resource('brief', value); const asset = await f.resource('asset', 'synthetic artwork');
  const map = await resourcesTool(f.root, { op: 'normalizeStructure', resourceId: 'brief-map', sourceRevisionId: source.revisionId, format: 'delivery-record',
    structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: asset.revisionId }] });
  for (const r of [source, asset, map]) await f.select(r);
  await assert.rejects(prepareInput(f.root, { revisionIds: [map.revisionId], ...await definitions(f, ['brief', 'asset', 'brief-map']) }), { code: 'STRUCTURE_BINDINGS_INCOMPLETE' });
  const forged = JSON.parse((await f.store.readContent(map.revisionId)).toString()); forged.structure.references = [];
  await assert.rejects(f.resource('forged', forged, 'structure-map'), { code: 'STRUCTURE_INVALID' });
});

test('reported rights preserve scope, conditions and revocation without granting approval', async (t) => {
  const f = await scopedFixture(t); const value = record('rights', { claims: [{ id: 'license', status: 'reported-revoked', permissions: ['distribution'],
    territories: ['KR'], channels: ['synthetic-channel'], validFrom: '2026-10-01T00:00:00Z', validUntil: null,
    conditions: 'Synthetic attribution required', attribution: 'Synthetic credit', evidence: [0] }] });
  const source = await f.resource('rights', value);
  const { structure } = await resourcesTool(f.root, { op: 'inspectStructure', revisionId: source.revisionId, format: 'delivery-record' });
  const claim = structure.units.find((u) => u.kind === 'rights-claim');
  assert.equal(claim.status, 'reported-revoked'); assert.deepEqual(claim.territories, ['KR']); assert.equal(claim.validUntil, null);
  assert.equal(claim.attribution, 'Synthetic credit'); assert.ok(!Object.hasOwn(claim, 'approved'));
  assert.ok(structure.coverage.unknown.some((item) => item.includes('legal rights')));
  value.details.claims[0].validUntil = '2026-09-01T00:00:00Z'; const bad = await f.resource('bad', value);
  await assert.rejects(resourcesTool(f.root, { op: 'inspectStructure', revisionId: bad.revisionId, format: 'delivery-record' }), { code: 'STRUCTURE_INVALID' });
});
