import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceStore } from '../../core/resources/revisions.js';

export async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'linivera-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createResourceStore(root);
  const json = (resourceId, kind, value) => store.propose({ resourceId, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
  const text = (resourceId, bytes) => store.propose({ resourceId, kind: 'document', owned: { bytes, mediaType: 'text/plain' } });
  return { root, store, json, text };
}
