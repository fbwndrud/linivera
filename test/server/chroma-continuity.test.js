import test from 'node:test';
import assert from 'node:assert/strict';
import { runChromaContinuity } from '../../examples/chroma-continuity.js';

test('one workspace carries provider files through P0-P4 into one context bundle and two later tasks', async () => {
  const result = await runChromaContinuity();
  for (const field of ['verified', 'singleWorkspace', 'originalsDeleted', 'bundleFeedsNextWork', 'historicalInputsVerified', 'capabilityCompared', 'requestBindingsPinned', 'productionOperation', 'connectionCompared', 'officialToolsReused', 'officialToolPartialDownloadRecovered']) assert.equal(result[field], true, field);
  assert.equal(result.serverRestarts, 2); assert.equal(result.exactBundleClosure, 60); assert.equal(result.officialCreates, 1);
  assert.deepEqual(Object.keys(result.refused).filter((key) => result.refused[key] !== true), []);
  assert.deepEqual(Object.keys(result.reviewPropagation).sort(), ['access-specification', 'connection-check', 'editing-dependency', 'input-specification', 'performance', 'project-external-state', 'provider-declaration', 'provider-raw', 'rights-evidence']);
  for (const field of ['actualModelGeneration', 'actualProviderNetwork', 'providerMcpActuallyCalled', 'mediaPlayback', 'editorRestore', 'externalPublication', 'legalApproval']) assert.equal(result[field], false, field);
});
