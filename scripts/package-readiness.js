import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Exercise refusal paths against the installed server, without repository fixtures or dev dependencies. */
export async function verifyInstalledReadiness(installed, sandbox) {
  const { productionHost } = await import(pathToFileURL(join(installed, 'examples/support/production-host.js')).href);
  const host = await productionHost(join(sandbox, 'readiness-guards'));
  try {
    const spec = await host.call('folio_resource_query', { op: 'specification', capabilityId: 'meshy-text-to-3d-preview-v1' });
    const specification = await host.json('specification', spec, 'capability-specification');
    const prompt = await host.call('folio_resources', { op: 'propose', resourceId: 'prompt', kind: 'text',
      owned: { bytes: 'Synthetic preview', mediaType: 'text/plain' } });
    const context = await host.json('context', { version: 1, scopeId: 'foreign-story', states: [] }, 'usage-context');
    const requestValue = { version: 1, ...spec.identity,
      parameters: { mode: 'preview', prompt: 'Synthetic preview', ai_model: 'meshy-7.1', target_formats: ['glb'] },
      inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: prompt.revisionId }],
      outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [
        { role: 'model', required: true, acceptableMediaTypes: ['model/obj'] },
        { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
      ] }] } };
    const request = await host.json('request', requestValue, 'generation-request');
    const scope = ['specification', 'prompt', 'context', 'request', 'scoped-request', 'readiness'];
    const definitions = {};
    for (const [kind, value] of Object.entries({
      profile: { version: 1, scope, maxInputBytes: 1048576 },
      pipeline: { version: 1, steps: [{ id: 'preview', capability: 'transform' }] },
      policy: { version: 1, scope, allowedActions: ['select-source', 'create-candidate'] },
    })) {
      const revision = await host.json(kind, value, kind); await host.select(revision);
      definitions[kind + 'RevisionId'] = revision.revisionId;
    }
    for (const revision of [specification, prompt, context, request]) await host.select(revision);
    const input = { ...definitions, specificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId,
      candidateRevisionIds: [prompt.revisionId], scopeId: 'story', search: { completeness: 'partial', reason: 'Synthetic exact prompt only.' } };
    const report = await host.call('folio_resource_query', { op: 'readiness', ...input });
    assert.equal(report.requestValidation.status, 'mismatch'); assert.equal(report.readiness.canPrepare, false);
    const retained = await host.call('folio_resource_query', { op: 'retainReadiness', resourceId: 'readiness', ...input });
    await host.select(retained);
    assert.equal((await host.attempt('folio_inputs', { op: 'prepare', ...definitions, revisionIds: [retained.revisionId] })).code, 'CAPABILITY_INPUTS_INCOMPLETE');
    const scopedValue = structuredClone(requestValue);
    scopedValue.outputSpec.groups[0].slots[0].acceptableMediaTypes = ['model/gltf-binary'];
    scopedValue.iteration = { baseRevisionIds: [context.revisionId], preserveRefs: [] };
    const scoped = await host.json('scoped-request', scopedValue, 'generation-request');
    const selection = await host.call('folio_inputs', { op: 'select', ...definitions, scopeId: 'story', actor: 'user',
      expectedScopeSelectionRevision: null, reason: 'Synthetic request-only root.',
      bindings: [{ bindingKey: 'request', role: 'request', resourceId: scoped.resourceId, revisionId: scoped.revisionId, mode: 'fixed' }] });
    assert.equal((await host.attempt('folio_inputs', { op: 'prepare', ...definitions, version: 2, scopeId: 'story',
      scopeSelectionRevision: selection.scopeSelectionRevision, bindingKeys: ['request'] })).code, 'CONTEXT_SCOPE_MISMATCH');
    return { verified: true, contradictoryOutputRefused: true, directIterationScopeRefused: true, actualProviderCalls: false };
  } finally { await host.close(); }
}
