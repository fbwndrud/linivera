import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { collectContext } from '../../core/context/collect.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { normalizeStructure } from '../../core/resources/structure-bindings.js';
import { syntheticDeliveryData } from '../../examples/support/synthetic-delivery.js';

const budget = { maxTextBytes: 4096, maxItems: 16, maxManifestBytes: 65536 };
const delivery = [{ kind: 'structure-map', format: 'delivery-record' }];
const requirements = [
  { role: 'deliverable', required: true },
  { role: 'brief', required: true, accepts: [{ ...delivery[0], recordType: 'brief' }], bindsRole: 'deliverable' },
  { role: 'rights', required: true, accepts: [{ ...delivery[0], recordType: 'rights' }], bindsRole: 'deliverable' },
  { role: 'note', required: false },
];

async function scenario(t) {
  const f = await fixture(t); const data = syntheticDeliveryData();
  const deliverable = await f.text('deliverable', 'Synthetic deliverable v1');
  const other = await f.text('other-deliverable', 'Synthetic deliverable for another cut');
  const proof = await f.text('proof', 'Synthetic source document');
  const note = await f.text('note', 'Synthetic optional note');
  async function record(id, value, subject, evidence = proof) {
    const source = await f.json(id, 'delivery-source', value);
    return normalizeStructure(f.root, { resourceId: id + '-map', sourceRevisionId: source.revisionId, format: 'delivery-record',
      structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: subject.revisionId }, ...(evidence ? [{ referenceKey: '/evidence/0/hint', revisionId: evidence.revisionId }] : [])] });
  }
  const brief = await record('brief', data.brief, deliverable); const rights = await record('rights', data.rights, deliverable);
  const otherRights = await record('other-rights', data.rights, other);
  const state = (role, revision, status = 'selected') => ({ role, status, artifactRevisionId: revision.revisionId, evidenceRevisionIds: [] });
  const context = (states, extra = {}) => ({ version: 1, scopeId: 'episode', pathId: 'main', requirements, states, ...extra });
  const complete = [state('deliverable', deliverable), state('brief', brief, 'observed'), state('rights', rights, 'observed'), state('note', note, 'observed')];
  const evidenceOnly = await record('evidence-only', data.rights, other, deliverable); const unlinked = await record('unlinked', data.rights, deliverable, null);
  return { ...f, deliverable, other, proof, note, brief, rights, otherRights, evidenceOnly, unlinked, state, context, complete };
}
const preview = (s, contextRevisionId, overrides = {}) => collectContext(s.root, { scopeId: 'episode', pathId: 'main', purpose: 'plan next cut', contextRevisionId, budget, ...overrides });

test('declared roles must name unique, typed and resolvable requirements', async (t) => {
  const s = await scenario(t);
  for (const bad of [[...requirements, { role: 'rights', required: false }], [{ role: 'rights', required: 'yes' }],
    [{ role: 'rights', required: true, bindsRole: 'missing' }], [{ role: 'rights', required: true, bindsRole: 'rights' }],
    [{ role: 'rights', required: true, accepts: [{ kind: 'text', format: 'delivery-record' }] }],
    [{ role: 'rights', required: true, accepts: [{ kind: 'structure-map', format: 'srt', recordType: 'rights' }] }],
    [{ role: 'deliverable', required: true }, { role: 'rights', required: true, bindsRole: 'deliverable' }], []]) {
    await assert.rejects(s.json('bad-' + bad.length, 'usage-context', s.context([], { requirements: bad })), { code: 'CONTEXT_INVALID' });
  }
});

test('a role rejects records of another type or for another deliverable revision', async (t) => {
  const s = await scenario(t);
  await assert.rejects(s.json('swapped', 'usage-context', s.context([s.state('deliverable', s.deliverable), s.state('rights', s.brief)])), { code: 'CONTEXT_INVALID' });
  await assert.rejects(s.json('foreign', 'usage-context', s.context([s.state('deliverable', s.deliverable), s.state('rights', s.otherRights)])), { code: 'CONTEXT_INVALID' });
  await assert.rejects(s.json('untyped', 'usage-context', s.context([s.state('deliverable', s.deliverable), s.state('brief', s.proof)])), { code: 'CONTEXT_INVALID' });
  // The deliverable in an evidence slot is not the record's subject.
  await assert.rejects(s.json('evidence-subject', 'usage-context', s.context([s.state('deliverable', s.deliverable), s.state('rights', s.evidenceOnly)])), { code: 'CONTEXT_INVALID' });
  await assert.rejects(s.json('two-deliverables', 'usage-context', s.context([s.state('deliverable', s.deliverable), s.state('deliverable', s.other), s.state('rights', s.otherRights)])), { code: 'CONTEXT_INVALID' });
});

test('a role whose map leaves a required slot unmapped is incomplete before input', async (t) => {
  const s = await scenario(t);
  const context = await s.json('unlinked-context', 'usage-context', s.context(s.complete.map((x) => x.role === 'rights' ? s.state('rights', s.unlinked, 'observed') : x)));
  const result = await preview(s, context.revisionId);
  assert.equal(result.ready, false); assert.equal(result.requirements.find((row) => row.role === 'rights').status, 'incomplete');
  await assert.rejects(s.json('unlinked-package', 'context-package', result.package), { code: 'CONTEXT_REQUIRED_MISSING' });
});

test('missing or budget-truncated required context blocks the package and the next input', async (t) => {
  const s = await scenario(t);
  const unknown = await s.json('unknown-rights', 'usage-context', s.context([...s.complete.filter((x) => x.role !== 'rights'),
    { role: 'rights', status: 'unknown', evidenceRevisionIds: [], unknown: 'Synthetic rights report not yet retained' }]));
  const partial = await preview(s, unknown.revisionId);
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.requirements.find((row) => row.role === 'rights'), { role: 'rights', required: true, status: 'unknown', revisionIds: [], included: false });
  await assert.rejects(s.json('partial-package', 'context-package', partial.package), { code: 'CONTEXT_REQUIRED_MISSING' });
  await assert.rejects(collectInputClosure(s.root, [unknown.revisionId]), (error) => error.code === 'CONTEXT_REQUIRED_MISSING' && error.details.missing.includes('rights'));
  const full = await s.json('full', 'usage-context', s.context(s.complete));
  const truncated = await preview(s, full.revisionId, { budget: { ...budget, maxItems: 2 } });
  assert.equal(truncated.ready, false);
  assert.equal(truncated.requirements.find((row) => row.role === 'rights').status, 'truncated');
  await assert.rejects(s.json('truncated-package', 'context-package', truncated.package), { code: 'CONTEXT_REQUIRED_MISSING' });
});

test('a complete package keeps exact roles, optional omissions and rejects forged requirements', async (t) => {
  const s = await scenario(t);
  const full = await s.json('full', 'usage-context', s.context(s.complete));
  const ready = await preview(s, full.revisionId);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.package.requirements, requirements);
  assert.deepEqual(ready.requirements.map((row) => [row.role, row.status, row.included]), [['deliverable', 'provided', true], ['brief', 'provided', true], ['rights', 'provided', true], ['note', 'provided', true]]);
  const saved = await s.json('package', 'context-package', ready.package);
  const closure = (await collectInputClosure(s.root, [saved.revisionId])).map((revision) => revision.resourceId);
  for (const id of ['package', 'deliverable', 'brief-map', 'brief', 'rights-map', 'rights', 'proof', 'note']) assert.ok(closure.includes(id), id);
  assert.ok(!closure.includes('full') && !closure.includes('other-deliverable'));
  const withoutOptional = await preview(s, full.revisionId, { budget: { ...budget, maxItems: 3 } });
  assert.equal(withoutOptional.ready, true); assert.equal(withoutOptional.requirements.find((row) => row.role === 'note').status, 'truncated');
  await s.json('optional-omitted', 'context-package', withoutOptional.package);
  const { requirements: _, ...unlabeled } = ready.package;
  await assert.rejects(s.json('forged-unlabeled', 'context-package', unlabeled), { code: 'CONTEXT_INVALID' });
  await assert.rejects(s.json('forged-relaxed', 'context-package', { ...ready.package, requirements: requirements.map((row) => ({ ...row, required: false })) }), { code: 'CONTEXT_INVALID' });
  const rightsIndex = ready.package.items.findIndex((item) => item.role === 'rights'); const items = ready.package.items.filter((_, i) => i !== rightsIndex);
  const dropped = { ...ready.package, items, referenceRevisionIds: [...new Set(items.flatMap((item) => item.referenceRevisionIds))].sort(),
    coverage: { ...ready.package.coverage, missing: [{ revisionId: s.rights.revisionId, role: 'rights', reason: 'forged omission' }] } };
  await assert.rejects(s.json('forged-dropped', 'context-package', dropped), { code: 'CONTEXT_REQUIRED_MISSING' });
});

test('contexts without requirements keep their previous meaning', async (t) => {
  const s = await scenario(t);
  const legacy = await s.json('legacy', 'usage-context', { version: 1, scopeId: 'episode', pathId: 'main', states: [s.state('rights', s.brief)] });
  const result = await preview(s, legacy.revisionId);
  assert.equal(result.ready, true); assert.deepEqual(result.requirements, []); assert.equal(result.package.requirements, undefined);
  await s.json('legacy-package', 'context-package', result.package);
});
