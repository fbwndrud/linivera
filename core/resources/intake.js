import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { MAX_RESOURCE_BYTES, validateProposal } from './schema.js';
import { createResourceStore } from './revisions.js';
import { assertResourceIntakePath, openResourceFile, storeResourceFile } from './blob-files.js';
import { withWorkLock } from '../run/work-lock.js';
import { resourceObjectPath, writeImmutable } from './files.js';

export async function readResourceFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new FolioError('RESOURCE_PATH_INVALID', 'an absolute regular file is required');
  let handle;
  try {
    if (!(await lstat(path)).isFile()) throw new Error('not regular');
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch { throw new FolioError('RESOURCE_PATH_INVALID', 'cannot read a regular file without following a link'); }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FolioError('RESOURCE_PATH_INVALID', 'not a regular file');
    if (info.size > MAX_RESOURCE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'file exceeds resource byte limit');
    const chunks = []; let length = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, MAX_RESOURCE_BYTES + 1 - length));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      chunks.push(chunk.subarray(0, bytesRead)); length += bytesRead;
      if (length > MAX_RESOURCE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'file grew beyond resource byte limit');
    }
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}

export async function importResourceFile(root, { path, contentHash = undefined, ...input }) {
  input = JSON.parse(canonicalJson(input));
  await assertResourceIntakePath(root, path);
  const probe = await openResourceFile(path); let size;
  try { size = (await probe.stat()).size; } finally { await probe.close(); }
  if (size > MAX_RESOURCE_BYTES) {
    const { mediaType, ...proposal } = input;
    validateProposal({ ...proposal, owned: { bytes: mediaType === 'application/json' ? 'null' : Buffer.alloc(0), mediaType } });
    return withWorkLock(root, async () => {
      const store = createResourceStore(root);
      for (const id of proposal.parents ?? []) if ((await store.readRevision(id)).resourceId !== proposal.resourceId) throw new FolioError('RESOURCE_PARENT_INVALID', 'parent belongs to another resource');
      const observed = await storeResourceFile(root, path, contentHash);
      const envelope = { version: 2, resourceId: proposal.resourceId, kind: proposal.kind, parents: proposal.parents ?? [],
        ...(proposal.schemaRef === undefined ? {} : { schemaRef: proposal.schemaRef }), storageStatus: 'owned_snapshot', ...observed, mediaType };
      const revisionId = sha256(canonicalJson(envelope));
      await writeImmutable(root, resourceObjectPath(root, revisionId, 'revisions'), canonicalJson(envelope));
      return { ...envelope, revisionId };
    });
  }
  const bytes = await readResourceFile(path);
  if (contentHash !== undefined && contentHash !== sha256(bytes)) throw new FolioError('RESOURCE_HASH_MISMATCH', 'file bytes differ from the expected fingerprint');
  const { mediaType, ...proposal } = input;
  return createResourceStore(root).propose({ ...proposal, owned: { bytes, mediaType } });
}
