import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBundleManifest } from '../../core/resources/bundles.js';

const member = (relativePath) => ({ resourceId: 'synthetic', revisionId: `sha256:${'a'.repeat(64)}`, relativePath, role: 'source', required: true });
test('intervening sibling names cannot hide file/directory conflicts in bundle members or missing files', () => {
  for (const paths of [['a', 'a-b', 'a/child'], ['root/a/child', 'root/a-b', 'root/a'], ['a/child', 'a', 'a-b']]) {
    assert.throws(() => validateBundleManifest({ version: 1, bundleType: 'workflow', members: paths.map(member) }), { code: 'BUNDLE_INVALID' });
  }
  for (const missing of ['a', 'a/child']) {
    const present = ['a', 'a-b', 'a/child'].filter((path) => path !== missing);
    assert.throws(() => validateBundleManifest({ version: 1, bundleType: 'workflow', members: present.map(member),
      unavailable: [{ relativePath: missing, role: 'source', required: true, reason: 'Synthetic missing export' }] }), { code: 'BUNDLE_INVALID' });
  }
  assert.equal(validateBundleManifest({ version: 1, bundleType: 'workflow', members: ['a-b', 'a/child', 'a/other'].map(member) }).completeness, 'complete');
});
