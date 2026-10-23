import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRegistry } from '../../packs/production/catalog-registry.js';
import { capabilityCatalog } from '../../packs/production/capability-catalog.js';
import { accessCatalog } from '../../packs/production/access-catalog.js';
import { capabilityReleaseV1, accessReleaseV1 } from '../../packs/production/catalog-release-v1.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

const hash = (entry) => sha256(canonicalJson(entry));
const code = 'CAPABILITY_SPEC_INVALID';
test('published first-release hash manifests remain byte compatible', () => {
  assert.equal(hash(capabilityReleaseV1), 'sha256:f58d5cc9881588a15ce0b54bd48101788e302640e4430a96ff81de6ef1e97dc6');
  assert.equal(hash(accessReleaseV1), 'sha256:e697a813453375f36a5249e37fe2f90ec2c208be7ecc5fb94c99947b40dae8b1');
  createCatalogRegistry(capabilityCatalog, [capabilityReleaseV1], code);
  createCatalogRegistry(accessCatalog, [accessReleaseV1], 'ACCESS_SPEC_INVALID');
});
for (const [name, mutate] of [
  ['removed edition', (entries) => { entries.pop(); }],
  ['changed evidence date', (entries) => { entries[0].evidence.checkedAt = '2099-01-01'; }],
  ['weakened input', (entries) => { entries[0].inputs[0].requirement = 'optional'; }],
  ['changed schema', (entries) => { entries[0].version = 2; }],
  ['duplicate ID', (entries) => { entries.push(entries[0]); }],
  ['unpublished successor', (entries) => { entries.push({ ...entries[0], id: 'synthetic-successor-v2' }); }],
]) {
  test(`catalog history refuses ${name}`, () => {
    const entries = structuredClone(capabilityCatalog); mutate(entries);
    assert.throws(() => createCatalogRegistry(entries, [capabilityReleaseV1], code), { code });
  });
}
test('later release cannot repin an existing ID even with matching or replaced bytes', () => {
  for (const pin of [capabilityReleaseV1['local-broker-v1'], `sha256:${'0'.repeat(64)}`]) {
    assert.throws(() => createCatalogRegistry(capabilityCatalog, [capabilityReleaseV1, { 'local-broker-v1': pin }], code), { code });
  }
});
test('appended editions preserve exact old lookup and isolate callers from stored history', () => {
  const entries = structuredClone(capabilityCatalog);
  const next = { ...structuredClone(entries.at(-1)), id: 'local-broker-v2' };
  next.evidence.checkedAt = '2026-10-24'; next.inputs[1].constraints.maxBytes = 1024;
  const registry = createCatalogRegistry([...entries, next], [capabilityReleaseV1, { [next.id]: hash(next) }], code);
  assert.deepEqual(registry.get('local-broker-v1'), entries.at(-1));
  assert.deepEqual(registry.get('local-broker-v2'), next);
  entries[0].inputs.length = 0; next.inputs.length = 0;
  registry.get('local-broker-v1').inputs.length = 0; registry.list()[0].inputs.length = 0;
  assert.ok(registry.get('local-broker-v1').inputs.length);
  assert.ok(registry.get('local-broker-v2').inputs.length);
  assert.throws(() => registry.get('local-broker-latest'), { code });
});
test('access route, capability edition and Chroma evidence are immutable together', () => {
  for (const mutate of [
    (entry) => { entry.route.version = 'unknown'; },
    (entry) => { entry.capabilityId = 'local-broker-v2'; },
    (entry) => { entry.chroma.status = 'confirmed'; },
  ]) {
    const entries = structuredClone(accessCatalog); mutate(entries[0]);
    assert.throws(() => createCatalogRegistry(entries, [accessReleaseV1], 'ACCESS_SPEC_INVALID'), { code: 'ACCESS_SPEC_INVALID' });
  }
});
