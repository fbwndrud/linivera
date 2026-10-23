import { createResourceStore } from './revisions.js';
import { inspectStructure } from './structures.js';
import { invalid, object } from '../../packs/production/structures/common.js';
import { canonicalJson } from '../util/hash.js';
import { FolioError } from '../errors.js';

export async function buildStructureMap(root, { sourceRevisionId, format, structureBindings, parserVersion = undefined, dependencyManifestRevisionId = undefined }) {
  const { revision, structure } = await inspectStructure(root, { revisionId: sourceRevisionId, format, parserVersion, dependencyManifestRevisionId });
  if (!Array.isArray(structureBindings) || structureBindings.length > 4096) invalid('explicit bounded structureBindings required');
  const store = createResourceStore(root); const seen = new Set(); const keys = new Set(structure.references.map((ref) => ref.key));
  const bindings = [];
  for (const binding of structureBindings) {
    if (!object(binding) || Object.keys(binding).sort().join(',') !== 'referenceKey,revisionId' || !keys.has(binding.referenceKey) || seen.has(binding.referenceKey)) invalid('binding must name one unique reference key from the inspected source');
    seen.add(binding.referenceKey);
    const target = await store.readRevision(binding.revisionId);
    if (target.storageStatus !== 'owned_snapshot') invalid('structure binding requires actual retained bytes');
    bindings.push({ referenceKey: binding.referenceKey, revisionId: target.revisionId });
  }
  bindings.sort((a, b) => a.referenceKey < b.referenceKey ? -1 : a.referenceKey > b.referenceKey ? 1 : 0);
  const unresolvedReferenceKeys = structure.references.filter((ref) => !seen.has(ref.key)).map((ref) => ref.key);
  return { version: 1, sourceRevisionId, sourceContentHash: revision.contentHash, format, parserVersion: structure.parserVersion, structure, bindings, unresolvedReferenceKeys,
    ...(dependencyManifestRevisionId === undefined ? {} : { dependencyManifestRevisionId }) };
}
export async function normalizeStructure(root, { resourceId, sourceRevisionId, format, structureBindings, parserVersion = undefined, dependencyManifestRevisionId = undefined }) {
  const value = await buildStructureMap(root, { sourceRevisionId, format, structureBindings, parserVersion, dependencyManifestRevisionId });
  return createResourceStore(root).propose({ resourceId, kind: 'structure-map', owned: { bytes: canonicalJson(value), mediaType: 'application/json' } });
}
/** Recalculate from immutable source bytes even for direct proposals and graph/index reads. */
export async function verifyStructureMap(root, value, { requireComplete = false } = {}) {
  if (!object(value) || value.version !== 1 || ![1, 2].includes(value.parserVersion)) invalid('versioned structure map required');
  const expected = await buildStructureMap(root, { sourceRevisionId: value.sourceRevisionId, format: value.format, structureBindings: value.bindings,
    parserVersion: value.parserVersion, dependencyManifestRevisionId: value.dependencyManifestRevisionId });
  if (canonicalJson(expected) !== canonicalJson(value)) invalid('structure differs from its retained source or exact bindings');
  const keys = new Set(value.bindings.map((binding) => binding.referenceKey));
  const missing = value.structure.references.filter((ref) => ref.required && !keys.has(ref.key));
  if (requireComplete && missing.length) throw new FolioError('STRUCTURE_BINDINGS_INCOMPLETE', 'Map required file/asset references before preparing the next input.', { missing: missing.map((ref) => ref.key) });
  return [value.sourceRevisionId, ...value.bindings.map((binding) => binding.revisionId), ...(value.dependencyManifestRevisionId ? [value.dependencyManifestRevisionId] : [])];
}
export async function readStructureRelations(root, revision, options = {}) {
  if (revision.kind !== 'structure-map') return [];
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalid('structure map requires owned JSON');
  const value = JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
  const refs = await verifyStructureMap(root, value, options);
  return refs.map((targetRevisionId, index) => ({ targetRevisionId, kind: index ? 'structure-reference' : 'structure-source' }));
}
