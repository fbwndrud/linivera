import assert from 'node:assert/strict';
import { nextTaskContext, syntheticProject, syntheticRecords } from './synthetic-chroma.js';
import { chromaReadinessGuards } from './chroma-readiness-guards.js';

const rejects = async (promise, code) => { const error = await promise; assert.equal(error.code, code, JSON.stringify(error)); return true; };

/** Refusals over public MCP on the same workspace after the bundle was used. */
export async function chromaGuards(host, s, { roles, budget, bundle, snapshot }) {
  const { call, attempt } = host; const R = (id) => s.resources.get(id);
  const propose = (resourceId, kind, value) => attempt('folio_resources', { op: 'propose', resourceId, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const preview = (contextRevisionId, extra = {}) => call('folio_resource_query', { op: 'context', scopeId: 'episode-1', pathId: 'main', purpose: 'guard check', contextRevisionId, budget, ...extra });
  const prepare = (ids, definitions) => attempt('folio_inputs', { op: 'prepare', ...(definitions ?? host.definitions), revisionIds: ids.map((id) => R(id).revisionId) });
  const unknownRights = { role: 'rights', status: 'unknown', evidenceRevisionIds: [], unknown: 'Synthetic rights report not retained' };

  // Missing required context: visible in preview, refused as a package and as a direct input.
  const missing = await s.retainJson('context-missing', nextTaskContext(roles, { override: { rights: unknownRights } }), 'usage-context');
  const partial = await preview(missing.revisionId);
  assert.equal(partial.ready, false); assert.equal(partial.requirements.find((r) => r.role === 'rights').status, 'unknown');
  const requiredContext = await rejects(propose('package-missing', 'context-package', partial.package), 'CONTEXT_REQUIRED_MISSING')
    && await rejects(prepare(['context-missing']), 'CONTEXT_REQUIRED_MISSING');
  const truncated = await preview(R('context').revisionId, { budget: { ...budget, maxItems: 3 } });
  assert.equal(truncated.ready, false);
  const budgetTruncation = await rejects(propose('package-missing', 'context-package', truncated.package), 'CONTEXT_REQUIRED_MISSING');

  // Missing required link: the role is present, but its record lacks the evidence binding.
  await s.connect('rights-unlinked-map', 'rights', 'delivery-record', { deliverable: 'deliverable', 'source-document': null });
  const linkless = nextTaskContext({ ...roles, rights: R('rights-unlinked-map') });
  await s.retainJson('context-unlinked', linkless, 'usage-context');
  const unlinked = await preview(R('context-unlinked').revisionId);
  assert.equal(unlinked.ready, false); assert.equal(unlinked.requirements.find((r) => r.role === 'rights').status, 'incomplete');
  // Without declared roles the package is retained, and the existing closure still refuses the unmapped slot.
  const { requirements: _, ...undeclared } = linkless;
  await s.retainJson('context-undeclared', undeclared, 'usage-context');
  await s.retainJson('package-unlinked', (await preview(R('context-undeclared').revisionId)).package, 'context-package');
  const requiredLink = await rejects(propose('package-missing', 'context-package', unlinked.package), 'CONTEXT_REQUIRED_MISSING')
    && await rejects(prepare(['package-unlinked']), 'STRUCTURE_BINDINGS_INCOMPLETE');

  // Wrong record type and records for another deliverable revision are refused.
  await s.connect('cut-rights-map', 'rights', 'delivery-record', { deliverable: 'cut', 'source-document': 'rights-proof' });
  const wrongRole = await rejects(propose('context-swapped', 'usage-context', nextTaskContext({ ...roles, rights: R('brief-map') })), 'CONTEXT_INVALID')
    && await rejects(propose('context-swapped', 'usage-context', nextTaskContext({ ...roles, rights: R('cut-rights-map') })), 'CONTEXT_INVALID');

  // Nested P3/P4 maps cannot carry another path's or story's contextual state into this bundle.
  const deliverable = { deliverable: R('deliverable') };
  await s.retainJson('other-path', { version: 1, scopeId: 'episode-1', pathId: 'side', states: nextTaskContext(deliverable).states }, 'usage-context');
  await s.retainJson('other-story', { version: 1, scopeId: 'episode-2', pathId: 'main', states: nextTaskContext(deliverable).states }, 'usage-context');
  await s.connect('rights-nested-map', 'rights', 'delivery-record', { deliverable: 'deliverable', 'source-document': 'other-path' });
  const nestedProject = await call('folio_resources', { op: 'propose', resourceId: 'project-nested-source', kind: 'project-source', owned: { bytes: JSON.stringify(syntheticProject()), mediaType: 'application/json' } });
  s.resources.set('project-nested-source', nestedProject);
  await s.connect('project-nested-map', 'project-nested-source', 'project-manifest', { scene: 'scene', media: 'cut', 'db-snapshot': 'other-story', environment: 'environment' });
  const nestedScope = await rejects(propose('context-swapped', 'usage-context', nextTaskContext({ ...roles, rights: R('rights-nested-map') })), 'CONTEXT_SCOPE_MISMATCH')
    && await rejects(propose('context-swapped', 'usage-context', nextTaskContext({ ...roles, project: R('project-nested-map') })), 'CONTEXT_SCOPE_MISMATCH')
    && await rejects(attempt('folio_resource_query', { op: 'context', scopeId: 'episode-1', pathId: 'main', purpose: 'nested', revisionIds: [R('project-nested-map').revisionId], budget }), 'CONTEXT_SCOPE_MISMATCH');

  // Forged bundle, link and release identity.
  const value = await s.readJson(bundle);
  const forgedBundle = await rejects(propose('forged-package', 'context-package', { ...value, items: value.items.map((item, i) => i ? item : { ...item, contentHash: R('cut').contentHash }) }), 'CONTEXT_INVALID')
    && await rejects(propose('forged-package', 'context-package', { ...value, referenceRevisionIds: [...value.referenceRevisionIds, R('other-path').revisionId].sort() }), 'CONTEXT_INVALID');
  const rightsMap = await s.readJson('rights-map');
  const relabel = (unit) => unit.kind === 'rights-claim' ? { ...unit, status: 'reported-revoked' } : unit;
  const forgedLink = await rejects(propose('forged-map', 'structure-map', { ...rightsMap, structure: { ...rightsMap.structure, units: rightsMap.structure.units.map(relabel) } }), 'STRUCTURE_INVALID')
    && await rejects(propose('forged-map', 'structure-map', { ...rightsMap, unresolvedReferenceKeys: [], bindings: rightsMap.bindings.filter((b) => b.referenceKey !== '/evidence/0/hint') }), 'STRUCTURE_INVALID');
  const performance = syntheticRecords().performance; performance.details.identity = { ...performance.details.identity, externalId: 'post-2' };
  s.resources.set('performance-forged-source', await call('folio_resources', { op: 'propose', resourceId: 'performance-forged-source', kind: 'delivery-source', owned: { bytes: JSON.stringify(performance), mediaType: 'application/json' } }));
  const forgedIdentity = await rejects(attempt('folio_resources', { op: 'normalizeStructure', resourceId: 'performance-forged-map', sourceRevisionId: R('performance-forged-source').revisionId, format: 'delivery-record',
    structureBindings: [{ referenceKey: '/subjects/0/hint', revisionId: R('release-map').revisionId }, { referenceKey: '/evidence/0/hint', revisionId: R('analytics-export').revisionId }] }), 'STRUCTURE_INVALID');

  // Input byte budget stays in force for a bundle.
  const small = await s.define(snapshot.manifest.scope, { maxInputBytes: 2048, profileId: 'small-profile', apply: false });
  const inputBudget = await rejects(prepare(['package'], small), 'INPUT_INVALID');

  // An older parser map may be bundled and sealed, but new work requires the current parser.
  await s.connect('workflow-v1-map', 'workflow', 'comfy-api', { image: 'provider-image', 'node-package': 'node-package', model: 'model' },
    { parserVersion: 1 });
  await s.retainJson('context-v1', nextTaskContext({ ...roles, workflow: R('workflow-v1-map') }), 'usage-context');
  await s.retainJson('package-v1', (await preview(R('context-v1').revisionId)).package, 'context-package');
  const sealed = await s.prepare(['package-v1']);
  const parserUpgrade = await rejects(attempt('folio_operations', { op: 'start', inputSnapshotId: sealed.inputSnapshotId, actor: 'user', idempotencyKey: 'old-parser' }), 'STRUCTURE_PARSER_UPGRADE_REQUIRED');
  await call('folio_inputs', { op: 'verify', inputSnapshotId: sealed.inputSnapshotId });
  const readiness = await chromaReadinessGuards(host, s, snapshot);
  return { refused: { requiredContext, budgetTruncation, requiredLink, wrongRole, nestedScope, forgedBundle, forgedLink, forgedIdentity, inputBudget, parserUpgrade, ...readiness } };
}
