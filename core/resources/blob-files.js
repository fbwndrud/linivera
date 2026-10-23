import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, unlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { FolioError } from '../errors.js';
import { assertManagedPath } from '../util/managed-path.js';
import { resourceObjectPath } from './files.js';
import { MAX_FILE_BYTES } from './schema.js';

export async function openResourceFile(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new FolioError('RESOURCE_PATH_INVALID', 'an absolute regular file is required');
  let handle;
  try {
    if (!(await lstat(path)).isFile()) throw new Error();
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    if (!(await handle.stat()).isFile()) throw new Error();
    return handle;
  } catch { await handle?.close(); throw new FolioError('RESOURCE_PATH_INVALID', 'cannot read a regular file without following a link'); }
}

/** OS aliases on workspace ancestors are allowed; selected-file links cannot redirect intake. */
export async function assertResourceIntakePath(root, path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) throw new FolioError('RESOURCE_PATH_INVALID', 'a normalized absolute file path is required');
  const target = resolve(path); const workspace = resolve(root);
  const base = parse(target).root; const parts = target.slice(base.length).split(sep); let current = base;
  for (const part of parts) {
    current = join(current, part);
    try {
      const workspaceAncestor = workspace.startsWith(current + sep);
      if ((await lstat(current)).isSymbolicLink() && !workspaceAncestor) throw new Error();
    }
    catch { throw new FolioError('RESOURCE_PATH_INVALID', 'linked or missing intake path'); }
  }
}

async function transfer(handle, writer = null) {
  const before = await handle.stat();
  if (!before.isFile() || before.size > MAX_FILE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'file exceeds the 2GiB limit');
  const hash = createHash('sha256'); let byteLength = 0;
  const buffer = Buffer.alloc(65536);
  for (;;) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (!bytesRead) break;
    byteLength += bytesRead;
    if (byteLength > MAX_FILE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'file grew beyond the 2GiB limit');
    const chunk = buffer.subarray(0, bytesRead); hash.update(chunk);
    if (writer) {
      let offset = 0;
      while (offset < chunk.length) {
        const result = await writer.write(chunk, offset, chunk.length - offset);
        if (!result.bytesWritten) throw new FolioError('RESOURCE_IO_FAILURE', 'file copy made no progress');
        offset += result.bytesWritten;
      }
    }
  }
  const after = await handle.stat();
  if (before.size !== byteLength || after.size !== byteLength || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'file changed while reading');
  return { contentHash: 'sha256:' + hash.digest('hex'), byteLength };
}

/** Fingerprint actual regular-file bytes without retaining them or trusting a caller's digest. */
export async function fingerprintResourceFile(path) {
  const handle = await openResourceFile(path);
  try { return await transfer(handle); } finally { await handle.close(); }
}

export async function verifyStoredBlob(root, envelope) {
  if (!Number.isSafeInteger(envelope.byteLength) || envelope.byteLength < 0 || envelope.byteLength > MAX_FILE_BYTES) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'invalid stored file size');
  const path = resourceObjectPath(root, envelope.contentHash, 'content');
  await assertManagedPath(root, path);
  let handle;
  try { handle = await openResourceFile(path); }
  catch (error) {
    if (error.code === 'RESOURCE_PATH_INVALID') throw new FolioError('RESOURCE_OBJECT_MISSING', 'immutable file is missing or unsafe');
    throw error;
  }
  try {
    const observed = await transfer(handle);
    if (observed.contentHash !== envelope.contentHash || observed.byteLength !== envelope.byteLength) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'snapshot hash or byte length differs');
    return observed;
  } finally { await handle.close(); }
}

export async function storeResourceFile(root, path, expectedHash) {
  const handle = await openResourceFile(path);
  const directory = join(root, '.folio', 'resources', 'content');
  const temporary = join(directory, `.blob-${randomUUID()}.tmp`);
  let writer;
  try {
    await assertManagedPath(root, directory, { directory: true }); await mkdir(directory, { recursive: true });
    await assertManagedPath(root, temporary); writer = await open(temporary, 'wx', 0o600);
    const observed = await transfer(handle, writer); await writer.sync(); await writer.close(); writer = null;
    if (expectedHash !== undefined && observed.contentHash !== expectedHash) throw new FolioError('RESOURCE_HASH_MISMATCH', 'file bytes differ from expected fingerprint');
    const destination = resourceObjectPath(root, observed.contentHash, 'content'); await assertManagedPath(root, destination);
    try { await link(temporary, destination); }
    catch (error) { if (error.code !== 'EEXIST') throw error; await verifyStoredBlob(root, observed); }
    return observed;
  } finally {
    await handle.close(); await writer?.close();
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function materializeResourceFile(root, envelope, output) {
  if (typeof output !== 'string' || !isAbsolute(output) || output.includes('\0') || resolve(output) !== output) throw new FolioError('RESOURCE_PATH_INVALID', 'a normalized absolute new output file is required');
  let parent;
  try { parent = await realpath(dirname(output)); }
  catch { throw new FolioError('RESOURCE_PATH_INVALID', 'output directory must already exist'); }
  const managed = resolve(await realpath(root), '.folio'); const target = join(parent, output.split(sep).at(-1));
  const rel = relative(managed, target);
  if (!rel || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) throw new FolioError('RESOURCE_PATH_INVALID', 'materialization cannot write managed state');
  try { await lstat(output); throw new FolioError('RESOURCE_OUTPUT_EXISTS', 'output must not exist'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(parent, `.materialize-${randomUUID()}.tmp`);
  const input = resourceObjectPath(root, envelope.contentHash, 'content'); await assertManagedPath(root, input);
  const handle = await openResourceFile(input); let writer;
  try {
    writer = await open(temporary, 'wx', 0o600);
    const observed = await transfer(handle, writer); await writer.sync(); await writer.close(); writer = null;
    if (observed.contentHash !== envelope.contentHash || observed.byteLength !== envelope.byteLength) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'materialized bytes differ');
    try { await link(temporary, target); }
    catch (error) { if (error.code === 'EEXIST') throw new FolioError('RESOURCE_OUTPUT_EXISTS', 'output must not exist'); throw error; }
    return { output: target, ...observed };
  } finally { await handle.close(); await writer?.close(); await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
