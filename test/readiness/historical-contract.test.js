import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { accessFixture } from '../access/fixture.js';
import { productionHost } from '../../examples/support/production-host.js';
import { getCapabilitySpec } from '../../packs/production/capabilities.js';
import { getAccessSpec } from '../../packs/production/access-specifications.js';
import { buildCapabilityReadiness } from '../../core/readiness/compare.js';
import { buildConnectionReadiness } from '../../core/access/compare.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { selectInput } from '../../core/resources/input-selections.js';
import { buildInputManifestV2 } from '../../core/resources/input-snapshots-v2.js';
import { writeImmutable } from '../../core/resources/files.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

async function legacyFixture(t, kind) {
  const f = await accessFixture(t);
  const spec = getCapabilitySpec('meshy-text-to-3d-preview-v1');
  const specification = await f.put('specification', 'capability-specification', spec, { select: true });
  const access = await f.put('other', 'access-specification', getAccessSpec('meshy-preview-official-mcp-v1'), { select: true });
  const request = await f.put('request', 'generation-request', { version: 1, ...spec.identity,
    parameters: { mode: 'preview', prompt: 'Count retained bytes', ai_model: 'meshy-7.1', target_formats: ['glb'] },
    inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: f.instruction.revisionId }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [
      { role: 'model', required: true, acceptableMediaTypes: ['model/obj'] },
      { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
    ] }] } }, { select: true });
  const checkValue = { ...f.checkValue, accessSpecificationRevisionId: access.revisionId,
    capabilitySpecificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId };
  // Raw v1 retention preserves historical facts; new observations use the current contract.
  const check = await f.put('context', 'connection-check', checkValue, { select: true });
  const definitions = Object.fromEntries(['profile', 'pipeline', 'policy'].map((key) => [key + 'RevisionId', f.input[key + 'RevisionId']]));
  const comparison = { ...definitions, scopeId: 'story', pathId: 'main', specificationRevisionId: specification.revisionId,
    requestRevisionId: request.revisionId, candidateRevisionIds: [f.instruction.revisionId], search: { completeness: 'partial', reason: 'Synthetic legacy report.' } };
  const connection = { ...definitions, scopeId: 'story', pathId: 'main', accountAlias: checkValue.accountAlias, projectAlias: checkValue.projectAlias,
    accessSpecificationRevisionId: access.revisionId, capabilitySpecificationRevisionId: specification.revisionId,
    requestRevisionId: request.revisionId, checkRevisionId: check.revisionId };
  let retained = check;
  if (kind !== 'connection-check') {
    const state = await readWorkspaceState(f.root);
    const report = kind === 'capability-readiness'
      ? await buildCapabilityReadiness(f.root, comparison, state, { reportVersion: 1 })
      : await buildConnectionReadiness(f.root, connection, state, new Date().toISOString());
    assert.equal(report.readiness.canPrepare, true);
    retained = await f.put('readiness', kind, report, { select: true });
  }
  const selection = await selectInput(f.root, { scopeId: 'story', expectedScopeSelectionRevision: null, actor: 'user',
    reason: 'Synthetic pre-guard historical Input.', ...definitions,
    bindings: [{ bindingKey: 'legacy', role: 'context', resourceId: retained.resourceId, revisionId: retained.revisionId, mode: 'fixed' }] });
  const input = { ...definitions, version: 2, scopeId: 'story', scopeSelectionRevision: selection.scopeSelectionRevision };
  const manifest = await buildInputManifestV2(f.root, input, await readWorkspaceState(f.root), { historical: true });
  const bytes = canonicalJson(manifest); const inputSnapshotId = sha256(bytes);
  await writeImmutable(f.root, join(f.root, '.folio/resources/inputs', inputSnapshotId.slice(7) + '.json'), bytes);
  return { ...f, input, manifest, inputSnapshotId, request, comparison, connection, checkValue };
}

for (const kind of ['capability-readiness', 'connection-check', 'connection-readiness']) {
  test(`legacy ${kind} preserves Input/hash while new preparation and execution reject its invalid output contract`, async (t) => {
    const f = await legacyFixture(t, kind); const host = await productionHost(f.root); t.after(() => host.close());
    await host.restart();
    const verified = await host.call('folio_inputs', { op: 'verify', inputSnapshotId: f.inputSnapshotId });
    assert.equal(verified.inputSnapshotId, f.inputSnapshotId); assert.deepEqual(verified.manifest, f.manifest);
    assert.equal((await host.attempt('folio_inputs', { op: 'prepare', ...f.input })).code, 'CAPABILITY_INPUTS_INCOMPLETE');
    assert.equal((await host.attempt('folio_operations', { op: 'start', inputSnapshotId: f.inputSnapshotId,
      requestRevisionId: f.request.revisionId, operationContractVersion: 2, actor: 'user', idempotencyKey: 'legacy-contract' })).code, 'CAPABILITY_INPUTS_INCOMPLETE');
    const fresh = await host.call('folio_resource_query', { op: 'readiness', ...f.comparison });
    assert.equal(fresh.version, 2); assert.equal(fresh.readiness.canPrepare, false);
    assert.equal((await host.attempt('folio_resource_query', { op: 'retainConnectionCheck', resourceId: 'context', check: f.checkValue })).code, 'CAPABILITY_SPEC_INVALID');
    assert.equal((await host.attempt('folio_resource_query', { op: 'connectionReadiness', ...f.connection })).code, 'CAPABILITY_SPEC_INVALID');
    assert.deepEqual((await host.call('folio_inputs', { op: 'verify', inputSnapshotId: f.inputSnapshotId })).manifest, f.manifest);
  });
}
