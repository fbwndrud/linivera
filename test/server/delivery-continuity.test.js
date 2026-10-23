import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeliveryContinuity } from '../../examples/delivery-continuity.js';

for (const change of ['rights', 'rights-proof', 'performance', 'contract']) test(`delivery knowledge survives MCP restart and propagates ${change} revisions through two later results`, async () => {
  const result = await runDeliveryContinuity({ change });
  for (const field of ['verified', 'serverRestarted', 'deliveryFeedsNextWork', 'exactDependencyClosure', 'releaseIdentityMatched', 'transitiveReviewRequired']) assert.equal(result[field], true, field);
  assert.equal(result.changed, change); assert.equal(result.actualModelGeneration, false); assert.equal(result.externalPublication, false); assert.equal(result.legalApproval, false);
});
