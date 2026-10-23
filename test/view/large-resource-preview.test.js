import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importResourceFile } from '../../core/resources/intake.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { buildMetadataProjection } from '../../core/projections/metadata.js';
import { viewResource } from '../../core/view/resources.js';

test('large JSON remains a verified metadata view without claiming to show a text excerpt', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'linivera-large-preview-')); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'synthetic.json'); await writeFile(path, JSON.stringify('x'.repeat(8 * 1024 * 1024)));
  const resource = await importResourceFile(root, { resourceId: 'synthetic-large-data', kind: 'workflow-source', path, mediaType: 'application/json' });
  await createResourceStore(root).decideSource({ revisionId: resource.revisionId, expectedSelectionRevision: null, action: { actor: 'user', type: 'select' } });
  await buildMetadataProjection(root);
  const detail = await viewResource(root, resource.revisionId);
  assert.equal(detail.entry.contentHash, resource.contentHash);
  assert.equal(detail.contentPreview, null);
  assert.equal(detail.previewTruncated, false);
});
