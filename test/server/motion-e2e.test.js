import test from 'node:test';
import assert from 'node:assert/strict';
import { runMotionExample } from '../../examples/motion.js';
test('stdio imports an existing managed asset, reuses its exact revision in two pipelines and follows change into both videos', async () => {
  const result = await runMotionExample();
  assert.equal(result.synthetic, true); assert.equal(result.verified, true); assert.equal(result.workflows, 2);
  assert.equal(result.outputsRetained, false); assert.equal(result.transitiveReviewRequired, true);
  assert.deepEqual(result.videos, ['film', 'narration']);
});
