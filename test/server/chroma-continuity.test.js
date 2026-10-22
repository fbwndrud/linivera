import test from 'node:test';
import assert from 'node:assert/strict';
import { runChromaContinuity } from '../../examples/chroma-continuity.js';

test('one workspace carries provider files through P0-P4 into one context bundle and two later tasks', async () => {
  const result = await runChromaContinuity();
  for (const field of ['verified', 'singleWorkspace', 'originalsDeleted', 'bundleFeedsNextWork', 'historicalInputsVerified']) assert.equal(result[field], true, field);
  assert.equal(result.serverRestarts, 2); assert.equal(result.exactBundleClosure, 37);
  assert.deepEqual(Object.keys(result.refused).filter((key) => result.refused[key] !== true), []);
  assert.deepEqual(Object.keys(result.reviewPropagation).sort(), ['editing-dependency', 'performance', 'project-external-state', 'provider-raw', 'rights-evidence']);
  for (const field of ['actualModelGeneration', 'actualProviderNetwork', 'mediaPlayback', 'editorRestore', 'externalPublication', 'legalApproval']) assert.equal(result[field], false, field);
});
