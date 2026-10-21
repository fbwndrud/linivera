import test from 'node:test';
import assert from 'node:assert/strict';
import { runScopedContinuity } from '../../examples/scoped-continuity.js';

test('fresh MCP host recovers isolated context, revises with exact old inputs, restores selection and renders motion', { timeout: 120000 }, async () => {
  const result = await runScopedContinuity();
  for (const key of ['verified', 'scopeIsolation', 'oldRevisionPreserved', 'selectionRestored', 'contextFeedsNextWork', 'videoAudio', 'transitiveReviewRequired']) assert.equal(result[key], true, key);
  assert.equal(result.actualModelGeneration, false);
});
