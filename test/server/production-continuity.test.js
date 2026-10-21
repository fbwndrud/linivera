import test from 'node:test';
import assert from 'node:assert/strict';
import { runProductionContinuity } from '../../examples/production-continuity.js';

test('captured generation survives MCP restart and feeds motion with transitive change review', { timeout: 120000 }, async () => {
  const result = await runProductionContinuity();
  assert.equal(result.verified, true);
  assert.equal(result.actualModelGeneration, false);
  assert.equal(result.serverRestarted, true);
  assert.equal(result.audioAligned, true);
  assert.equal(result.videoAudio, true);
  assert.equal(result.transitiveReviewRequired, true);
});
