import test from 'node:test';
import assert from 'node:assert/strict';
import { getCapabilitySpec, listCapabilitySpecs, validateCapabilitySpec, validateCapabilityRequest, validateCapabilityValue } from '../../packs/production/capabilities.js';
import { createFalAdapter } from '../../adapters/production/fal.js';
import { createElevenLabsAdapter } from '../../adapters/production/elevenlabs.js';
import { createMeshyAdapter } from '../../adapters/production/meshy.js';

const revisionId = `sha256:${'a'.repeat(64)}`;
const binding = (fieldPath) => ({ fieldPath, role: fieldPath, revisionId });
const slot = (role, mediaTypes, extra = {}) => ({ role, required: true, acceptableMediaTypes: mediaTypes, ...extra });
function request(id) {
  const spec = getCapabilitySpec(id);
  const parameters = {
    'fal-flux-schnell-v1': { prompt: 'Synthetic square', num_images: 2, output_format: 'png' },
    'elevenlabs-tts-timestamps-v1': { text: 'Hi', output_format: 'mp3_44100_128' },
    'meshy-text-to-3d-preview-v1': { mode: 'preview', prompt: 'Synthetic cube', ai_model: 'meshy-7.1', target_formats: ['glb', 'obj'] },
    'local-broker-v1': { instruction: 'Read synthetic source bytes' },
  }[id];
  const slots = {
    'fal-flux-schnell-v1': [slot('image', ['image/png'])],
    'elevenlabs-tts-timestamps-v1': [slot('audio', ['audio/mpeg'])],
    'meshy-text-to-3d-preview-v1': [slot('model', ['model/gltf-binary', 'model/obj'], { cardinality: 2 }), slot('bundle', ['application/json'])],
    'local-broker-v1': [slot('result', ['application/json'])],
  }[id];
  return { version: 1, ...spec.identity, endpoint: spec.identity.endpoint.replace('{voice_id}', 'synthetic-voice'), parameters,
    inputBindings: spec.inputs.filter((input) => input.source !== 'parameter' && input.requirement === 'required').map((input) => binding(input.fieldPath)),
    outputSpec: { groupPolicy: 'fixed', groups: Array.from({ length: id === 'fal-flux-schnell-v1' ? 2 : 1 }, (_, i) => ({ groupId: `take-${i}`, slots: structuredClone(slots) })) } };
}
test('versioned catalog isolates callers and refuses forged official requirements or provenance', () => {
  const specs = listCapabilitySpecs();
  assert.equal(specs.length, 4);
  specs[0].inputs.length = 0;
  assert.ok(getCapabilitySpec(specs[0].id).inputs.length > 0);
  for (const mutate of [
    (spec) => { spec.inputs[0].requirement = 'optional'; },
    (spec) => { spec.evidence.checkedAt = '2099-01-01'; },
    (spec) => { spec.identity.model = 'unreviewed-model'; },
  ]) {
    const spec = getCapabilitySpec('fal-flux-schnell-v1'); mutate(spec);
    assert.throws(() => validateCapabilitySpec(spec), { code: 'CAPABILITY_SPEC_INVALID' });
  }
  assert.equal(getCapabilitySpec('local-broker-v1').support.status, 'user-declared');
  assert.throws(() => getCapabilitySpec('unresearched-provider'), { code: 'CAPABILITY_SPEC_INVALID' });
});
test('representative requests reuse real adapter prepare validation without calling a provider', async () => {
  const text = { 'fal-flux-schnell-v1': 'Synthetic square', 'elevenlabs-tts-timestamps-v1': 'Hi', 'meshy-text-to-3d-preview-v1': 'Synthetic cube' };
  const noNetwork = async () => { throw new Error('test must never call transport'); };
  const adapters = {
    'fal-flux-schnell-v1': createFalAdapter({ accountAlias: 'fixture', transport: { submit: noNetwork, status: noNetwork, result: noNetwork, download: noNetwork } }),
    'elevenlabs-tts-timestamps-v1': createElevenLabsAdapter({ accountAlias: 'fixture', transport: { convertWithTimestamps: noNetwork } }),
    'meshy-text-to-3d-preview-v1': createMeshyAdapter({ accountAlias: 'fixture', transport: { submit: noNetwork, get: noNetwork, download: noNetwork } }),
  };
  for (const [id, adapter] of Object.entries(adapters)) {
    const value = request(id);
    assert.equal(validateCapabilityRequest(id, value), value);
    const prepared = await adapter.prepare(value, [{ revisionId, bytes: Buffer.from(text[id]), mediaType: 'text/plain' }]);
    assert.equal(prepared.requestDigest.startsWith('sha256:'), true);
    assert.equal(prepared.inputMapping[0].revisionId, revisionId);
  }
});
test('catalog identity does not silently accept a different product, model, endpoint, or schema', () => {
  for (const key of ['provider', 'product', 'capability', 'model', 'endpoint', 'schemaVersion']) {
    const value = request('local-broker-v1'); value[key] = 'different';
    assert.throws(() => validateCapabilityRequest('local-broker-v1', value), { code: 'CAPABILITY_SPEC_INVALID' });
  }
  const value = request('elevenlabs-tts-timestamps-v1'); value.parameters.model_id = 'eleven_turbo_v2_5';
  assert.throws(() => validateCapabilityRequest('elevenlabs-tts-timestamps-v1', value), { code: 'CAPABILITY_SPEC_INVALID' });
});
test('local broker keeps parameters, files, and optional context distinct', () => {
  const value = request('local-broker-v1');
  assert.equal(validateCapabilityRequest('local-broker-v1', value), value);
  value.inputBindings.push(binding('context'));
  validateCapabilityRequest('local-broker-v1', value);
  value.inputBindings = value.inputBindings.filter((input) => input.fieldPath !== 'source');
  assert.throws(() => validateCapabilityRequest('local-broker-v1', value), /source/);
  value.inputBindings.push(binding('source')); value.parameters.source = 'file-name-is-not-input';
  assert.throws(() => validateCapabilityRequest('local-broker-v1', value), /undeclared capability parameter/);
});
test('representative constraints reject out of range, undeclared parameters and mismatched output commitments', () => {
  const cases = [
    ['fal-flux-schnell-v1', (value) => { value.parameters.num_images = 5; }],
    ['fal-flux-schnell-v1', (value) => { value.parameters.sync_mode = true; }],
    ['fal-flux-schnell-v1', (value) => { value.outputSpec.groups[0].slots[0].acceptableMediaTypes = ['image/jpeg']; }],
    ['fal-flux-schnell-v1', (value) => { value.parameters.image_size = { width: -1, height: 1 }; }],
    ['elevenlabs-tts-timestamps-v1', (value) => { value.parameters.seed = -1; }],
    ['elevenlabs-tts-timestamps-v1', (value) => { value.parameters.pronunciation_dictionary_locators = [1]; }],
    ['elevenlabs-tts-timestamps-v1', (value) => { value.parameters.previous_request_ids = ['one', 'two', 'three', 'four']; }],
    ['elevenlabs-tts-timestamps-v1', (value) => { value.parameters.enable_logging = 'yes'; }],
    ['elevenlabs-tts-timestamps-v1', (value) => { value.parameters.output_format = 'wav_44100'; }],
    ['meshy-text-to-3d-preview-v1', (value) => { value.parameters.prompt = 'a'.repeat(801); }],
    ['meshy-text-to-3d-preview-v1', (value) => { value.parameters.ai_model = 'latest'; }],
    ['meshy-text-to-3d-preview-v1', (value) => { value.parameters.target_formats = ['glb', 'glb']; }],
    ['meshy-text-to-3d-preview-v1', (value) => { value.outputSpec.groups[0].slots[0].cardinality = 1; }],
    ['local-broker-v1', (value) => { value.outputSpec.groups[0].slots[0].role = 'unreported'; }],
    ['local-broker-v1', (value) => { value.inputBindings.push(binding('unconsumed')); }],
  ];
  for (const [id, mutate] of cases) {
    const value = request(id); mutate(value);
    assert.throws(() => validateCapabilityRequest(id, value), `${id} must reject an invalid representative request`);
  }
});
test('field validation is reusable by comparison and preserves typed nullability', () => {
  const spec = getCapabilitySpec('elevenlabs-tts-timestamps-v1');
  const seed = spec.inputs.find((input) => input.fieldPath === 'seed');
  validateCapabilityValue(seed, null); validateCapabilityValue(seed, 0);
  assert.throws(() => validateCapabilityValue(seed, 4294967296), /numeric constraint/);
  assert.throws(() => validateCapabilityValue(seed, 0.5), /value type/);
});
