import test from 'node:test';
import assert from 'node:assert/strict';
import { runStructureContinuity } from '../../examples/structure-continuity.js';

test('actual stdio restart preserves output → structure → next work and historical dependency review', { timeout: 120000 }, async () => {
  const result = await runStructureContinuity();
  for (const key of ['verified', 'serverRestarted', 'structureFeedsNextWork', 'exactDependencyClosure', 'indexedRelationsVerified', 'transitiveReviewRequired']) assert.equal(result[key], true, key);
  assert.equal(result.actualModelGeneration, false);
});
