import { createHash } from 'node:crypto';
import { resourceObjectPath } from './files.js';
import { openResourceFile } from './blob-files.js';
import { assertManagedPath } from '../util/managed-path.js';
import { invalid, json, MAX_STRUCTURE_BYTES } from '../../packs/production/structures/common.js';
import { FolioError } from '../errors.js';

/** Single sequential hash pass captures only the bounded JSON chunk, never the binary payload. */
export async function readGlbSource(root, revision) {
  const path = resourceObjectPath(root, revision.contentHash, 'content'); await assertManagedPath(root, path);
  const handle = await openResourceFile(path); const hash = createHash('sha256'); let offset = 0;
  async function read(length) {
    if (offset + length > revision.byteLength) invalid('GLB chunk exceeds retained container');
    const bytes = Buffer.alloc(length); let count = 0;
    while (count < length) {
      const result = await handle.read(bytes, count, length - count, null);
      if (!result.bytesRead) invalid('truncated GLB'); count += result.bytesRead;
    }
    hash.update(bytes); offset += length; return bytes;
  }
  try {
    const before = await handle.stat(); const header = await read(12);
    if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== revision.byteLength) invalid('GLB magic, version or total length differs');
    let document; let binaryByteLength = null; let chunks = 0; const unknown = [];
    while (offset < revision.byteLength) {
      if (++chunks > 4096) invalid('too many GLB chunks');
      const chunk = await read(8); const length = chunk.readUInt32LE(0); const type = chunk.readUInt32LE(4);
      if (length % 4 || offset + length > revision.byteLength) invalid('GLB chunk length must fit and be aligned');
      if (chunks === 1) {
        if (type !== 0x4e4f534a || length > MAX_STRUCTURE_BYTES) invalid('GLB first chunk must be bounded JSON');
        document = json(await read(length));
      } else {
        if (type === 0x4e4f534a || (type === 0x004e4942 && (chunks !== 2 || binaryByteLength !== null))) invalid('invalid GLB chunk order');
        if (type === 0x004e4942) binaryByteLength = length;
        else unknown.push('Uninterpreted GLB chunk type: ' + type);
        let remaining = length;
        while (remaining) { const size = Math.min(remaining, 65536); await read(size); remaining -= size; }
      }
    }
    if (!document) invalid('GLB JSON chunk missing');
    const after = await handle.stat();
    if ('sha256:' + hash.digest('hex') !== revision.contentHash || before.size !== offset || after.size !== offset || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new FolioError('RESOURCE_INTEGRITY_FAILURE', 'GLB bytes changed or hash differs');
    return { document, binaryByteLength, unknown };
  } finally { await handle.close(); }
}
