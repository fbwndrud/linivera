import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessFixture } from './fixture.js';
import { resourceQueryTool } from '../../server/tools/resource-query.js';
import { collectInputClosure } from '../../core/resources/input-closure.js';
import { getCapabilitySpec } from '../../packs/production/capabilities.js';

test('public readiness rejects a Meshy output slot that cannot accept every requested format', async (t) => {
  const f = await readinessFixture(t);
  const spec = getCapabilitySpec('meshy-text-to-3d-preview-v1');
  const specification = await f.put('specification', 'capability-specification', spec);
  for (const [formats, mediaTypes] of [[['glb'], ['model/obj']], [['glb', 'obj'], ['model/gltf-binary']]]) {
    const request = await f.put('request', 'generation-request', { version: 1, ...spec.identity,
      parameters: { mode: 'preview', prompt: 'Count retained bytes', ai_model: 'meshy-7.1', target_formats: formats },
      inputBindings: [{ fieldPath: 'prompt', role: 'prompt', revisionId: f.instruction.revisionId }],
      outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'one', slots: [
        { role: 'model', required: true, acceptableMediaTypes: mediaTypes, cardinality: formats.length },
        { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
      ] }] } });
    const input = { ...f.input, specificationRevisionId: specification.revisionId, requestRevisionId: request.revisionId };
    const report = await resourceQueryTool(f.root, { op: 'readiness', ...input });
    assert.equal(report.requestValidation.status, 'mismatch');
    assert.equal(report.readiness.canPrepare, false);
    const retained = await resourceQueryTool(f.root, { op: 'retainReadiness', resourceId: 'readiness', ...input });
    await assert.rejects(collectInputClosure(f.root, [retained.revisionId]), { code: 'CAPABILITY_INPUTS_INCOMPLETE' });
  }
});
