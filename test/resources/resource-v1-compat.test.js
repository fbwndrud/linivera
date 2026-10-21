import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';
import { resourcesTool } from '../../server/tools/resources.js';

test('small legacy content keeps the historical v1 envelope hash on proposal and file import', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-v1-golden-')); t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const revision = await store.propose({ resourceId: 'legacy', kind: 'document', owned: { mediaType: 'text/plain', bytes: 'synthetic-v1' } });
  assert.equal(revision.version, 1);
  assert.equal(revision.contentHash, 'sha256:971febc239d9466f21f9c2b309808afb95e9a4a496a4680b9029a4608b8dfc99');
  assert.equal(revision.revisionId, 'sha256:dc5b271b72b082436034ef2afdfa9e8e63d5176bc9e7d36ee4352dfc13087e7e');
  const path = join(root, 'legacy.txt'); await writeFile(path, 'synthetic-v1');
  const imported = await resourcesTool(root, { op: 'importFile', resourceId: 'legacy', kind: 'document', path, mediaType: 'text/plain' });
  assert.equal(imported.revisionId, revision.revisionId);
  assert.equal((await store.readContent(revision.revisionId)).toString(), 'synthetic-v1');
});
