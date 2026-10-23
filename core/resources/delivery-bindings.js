import { createResourceStore } from './revisions.js';
import { inspectStructure } from './structures.js';
import { invalid } from '../../packs/production/structures/common.js';
import { canonicalJson } from '../util/hash.js';

/** A metric must refer to a release with the exact platform/account/external identity it measures. */
export async function verifyDeliveryBindings(root, structure, bindings) {
  if (structure.format !== 'delivery-record') return;
  const record = structure.units.find((unit) => unit.id === '/');
  if (record.recordType !== 'performance') return;
  const binding = bindings.find((row) => row.referenceKey === '/subjects/0/hint'); if (!binding) return;
  const store = createResourceStore(root); const target = await store.readRevision(binding.revisionId);
  if (target.kind !== 'structure-map' || target.mediaType !== 'application/json') invalid('performance subject requires a retained release structure map');
  const value = JSON.parse((await store.readContent(target.revisionId)).toString('utf8'));
  if (value.format !== 'delivery-record') invalid('performance subject requires a delivery release');
  const actual = await inspectStructure(root, { revisionId: value.sourceRevisionId, format: value.format, parserVersion: value.parserVersion });
  if (value.sourceContentHash !== actual.revision.contentHash || canonicalJson(value.structure) !== canonicalJson(actual.structure)) invalid('release map differs from its retained source');
  const release = actual.structure.units.find((unit) => unit.id === '/');
  if (release.recordType !== 'release' || canonicalJson(release.identity) !== canonicalJson(record.identity)) invalid('performance release identity differs in platform, account or external ID');
}
