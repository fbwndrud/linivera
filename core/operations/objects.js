import { join } from 'node:path';
import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertRevisionId } from '../resources/schema.js';
import { readObject, writeImmutable } from '../resources/files.js';
export function fail(code, message) { throw new FolioError(code, message); }
export function copy(value) { try { return JSON.parse(canonicalJson(value)); } catch { fail('OPERATION_INVALID', 'JSON caller values required'); } }
function path(root, kind, id) { assertRevisionId(id); return join(root, '.folio', 'operations', kind, id.slice(7) + '.json'); }
export async function put(root, kind, value, id = sha256(canonicalJson(value))) {
  await writeImmutable(root, path(root, kind, id), canonicalJson({ digest: sha256(canonicalJson(value)), value })); return id;
}
export async function get(root, kind, id, optional = false) {
  let bytes;
  try { bytes = await readObject(root, path(root, kind, id)); } catch (error) { if (optional && error.code === 'RESOURCE_OBJECT_MISSING') return null; throw error; }
  const envelope = JSON.parse(bytes.toString('utf8'));
  if (canonicalJson(envelope) !== bytes.toString('utf8') || envelope.digest !== sha256(canonicalJson(envelope.value))) fail('OPERATION_INTEGRITY_FAILURE', 'operation object digest differs');
  if (['receipts', 'intents', 'decisions', 'group-receipts', 'group-intents', 'group-decisions'].includes(kind) && envelope.digest !== id) fail('OPERATION_INTEGRITY_FAILURE', 'content-addressed object differs');
  return envelope.value;
}
