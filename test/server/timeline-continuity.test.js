import test from 'node:test';
import assert from 'node:assert/strict';
import { runTimelineContinuity } from '../../examples/timeline-continuity.js';

for (const change of ['media', 'contract']) test(`actual MCP timeline and extension inputs survive restart and track ${change} changes transitively`, async () => {
  const result = await runTimelineContinuity({ change });
  for (const field of ['verified', 'serverRestarted', 'timelineFeedsNextWork', 'dependencyClosure', 'transitiveReviewRequired']) assert.equal(result[field], true, field);
  assert.equal(result.changed, change); assert.equal(result.actualModelGeneration, false);
});
