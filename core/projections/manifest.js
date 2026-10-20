import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertManagedPath } from '../util/managed-path.js';
import { readObject, writeImmutable } from '../resources/files.js';
import { isImmutableStage } from '../resources/immutable-stage.js';
import { readWorkspaceState } from '../publications/state.js';
import { assertRevisionId } from '../resources/schema.js';
import { fail } from '../operations/objects.js';
const directory = (root) => join(root, '.folio', 'projections', 'metadata');
export async function saveGeneration(root, manifest, entries) {
  const generationId = sha256(canonicalJson({ manifest, entries }));
  const value = { manifest: { ...manifest, generationId }, entries };
  await writeImmutable(root, join(directory(root), generationId.slice(7) + '.json'), canonicalJson(value));
  return value.manifest;
}
export async function readGeneration(root, generationId) {
  assertRevisionId(generationId);
  const bytes = await readObject(root, join(directory(root), generationId.slice(7) + '.json'));
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('PROJECTION_INTEGRITY_FAILURE', 'invalid generation JSON'); }
  const { generationId: id, ...manifest } = value.manifest ?? {};
  if (id !== generationId || sha256(canonicalJson({ manifest, entries: value.entries })) !== id || value.manifest.version !== 1 || value.manifest.kind !== 'metadata' || value.manifest.status !== 'complete' ||
    !Array.isArray(value.entries) || canonicalJson(value.manifest.outputHashes) !== canonicalJson([sha256(canonicalJson(value.entries))])) fail('PROJECTION_INTEGRITY_FAILURE', 'generation bindings differ');
  const state = await readWorkspaceState(root, { checkpoint: manifest.workspaceCheckpoint });
  if (manifest.inputManifestId !== sha256(canonicalJson(state.markers))) fail('PROJECTION_INTEGRITY_FAILURE', 'generation checkpoint input differs');
  return value;
}
export async function listGenerations(root) {
  await assertManagedPath(root, directory(root), { directory: true });
  let names;
  try { names = await readdir(directory(root)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const values = [];
  for (const name of names) {
    if (await isImmutableStage(root, join(directory(root), name))) continue;
    if (!/^[a-f0-9]{64}\.json$/.test(name)) fail('PROJECTION_INTEGRITY_FAILURE', 'unsupported generation filename');
    values.push(await readGeneration(root, 'sha256:' + name.slice(0, -5)));
  }
  return values.sort((a, b) => b.manifest.workspaceCheckpoint.seq - a.manifest.workspaceCheckpoint.seq
    || b.manifest.generatorRevision.localeCompare(a.manifest.generatorRevision));
}

export function assertProjectionCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint) || Object.keys(checkpoint).some((k) => !['seq', 'hash'].includes(k)) || !Number.isSafeInteger(checkpoint.seq) || checkpoint.seq < 0 || typeof checkpoint.hash !== 'string') fail('WORKSPACE_CHECKPOINT_INVALID', 'exact seq/hash checkpoint required');
}
