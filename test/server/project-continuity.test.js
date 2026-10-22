import test from 'node:test';
import assert from 'node:assert/strict';
import { runProjectContinuity } from '../../examples/project-continuity.js';

for (const change of ['database', 'sheet']) test(`unknown partner capture feeds exact project inputs after MCP restart and propagates ${change} changes`, async () => {
  const result = await runProjectContinuity({ change });
  for (const field of ['verified', 'brokerFilesRetained', 'serverRestarted', 'projectFeedsNextWork', 'dependencyClosure', 'transitiveReviewRequired']) assert.equal(result[field], true, field);
  assert.equal(result.changed, change); assert.equal(result.actualModelGeneration, false); assert.equal(result.actualBrokerNetwork, false); assert.equal(result.runtimeRestored, false);
});
