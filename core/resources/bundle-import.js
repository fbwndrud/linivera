import { FolioError } from '../errors.js';
import { canonicalJson } from '../util/hash.js';
import { createResourceStore } from './revisions.js';
import { importResourceFile } from './intake.js';
import { assertBundlePath, collectBundleClosure, MAX_BUNDLE_BYTES, MAX_BUNDLE_MEMBERS, validateBundleManifest } from './bundles.js';

/** Import explicitly mapped local files; never executes code or fetches external dependencies. */
export async function importResourceBundle(root, input) {
  input = JSON.parse(canonicalJson(input));
  if (Object.keys(input).some((key) => !['resourceId', 'manifest', 'pathMappings', 'parents', 'schemaRef'].includes(key))) throw new FolioError('BUNDLE_INVALID', 'unknown import field');
  const { resourceId, manifest, pathMappings = [], parents = [], schemaRef } = input;
  const draft = validateBundleManifest(manifest, { draft: true });
  if (!Array.isArray(pathMappings) || pathMappings.length > 4096) throw new FolioError('BUNDLE_INVALID', 'invalid file mappings');
  const mappings = new Map();
  for (const mapping of pathMappings) {
    if (!mapping || Object.keys(mapping).some((key) => !['relativePath', 'path', 'mediaType', 'contentHash'].includes(key))) throw new FolioError('BUNDLE_INVALID', 'invalid mapping');
    assertBundlePath(mapping.relativePath);
    const member = draft.members.find((item) => item.relativePath === mapping.relativePath);
    if (!member || member.revisionId || mappings.has(mapping.relativePath)) throw new FolioError('BUNDLE_INVALID', 'mapping must name one unpinned member');
    mappings.set(mapping.relativePath, mapping);
  }
  const store = createResourceStore(root); const members = []; const unavailable = [...(draft.unavailable ?? [])]; let totalBytes = 0;
  for (const member of draft.members) {
    let revision;
    if (member.revisionId) revision = await store.readRevision(member.revisionId);
    else {
      const mapping = mappings.get(member.relativePath);
      if (!mapping) { unavailable.push({ ...member, reason: 'No local file or pinned revision was supplied' }); continue; }
      revision = await importResourceFile(root, { resourceId: member.resourceId, kind: 'artifact-file', path: mapping.path, mediaType: mapping.mediaType, ...(mapping.contentHash === undefined ? {} : { contentHash: mapping.contentHash }) });
    }
    if (revision.resourceId !== member.resourceId) throw new FolioError('BUNDLE_INVALID', 'member identity differs');
    totalBytes += revision.byteLength ?? 0;
    if (totalBytes > MAX_BUNDLE_BYTES) throw new FolioError('BUNDLE_INVALID', 'bundle exceeds 8GiB');
    members.push({ ...member, revisionId: revision.revisionId });
  }
  const value = validateBundleManifest({ ...draft, members, unavailable, completeness: unavailable.some((item) => item.required !== false) ? 'incomplete' : 'complete' });
  const closure = await collectBundleClosure(root, members.map((item) => item.revisionId), { requireComplete: false, initialReferences: members.length });
  if (closure.length > MAX_BUNDLE_MEMBERS) throw new FolioError('BUNDLE_INVALID', 'expanded bundle has too many members');
  const bytes = canonicalJson(value);
  if (closure.reduce((sum, item) => sum + (item.byteLength ?? 0), Buffer.byteLength(bytes)) > MAX_BUNDLE_BYTES) throw new FolioError('BUNDLE_INVALID', 'expanded bundle exceeds 8GiB');
  return store.propose({ resourceId, kind: 'artifact-bundle', parents, ...(schemaRef === undefined ? {} : { schemaRef }), owned: { mediaType: 'application/json', bytes } });
}
