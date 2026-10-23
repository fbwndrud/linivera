import { FolioError } from '../errors.js';
import { assertResourceId, assertRevisionId } from './schema.js';
import { createResourceStore } from './revisions.js';

export const MAX_BUNDLE_MEMBERS = 4096;
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024 * 1024;
function invalid(message) { throw new FolioError('BUNDLE_INVALID', message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed) { if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('unknown bundle field'); }
function role(value) { if (typeof value !== 'string' || !value.trim() || value.length > 128) invalid('member role required'); }
export function assertBundlePath(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value || /[\\\0:]/.test(value) || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) invalid('normalized relative member path required');
}
export function validateBundleManifest(value, { draft = false } = {}) {
  fields(value, ['version', 'bundleType', 'members', 'entrypoints', 'unavailable', 'completeness', 'dependencyCoverage', 'restorability']);
  if (value.version !== 1) invalid('bundle version 1 required'); assertResourceId(value.bundleType);
  if (!Array.isArray(value.members) || value.members.length > MAX_BUNDLE_MEMBERS) invalid('invalid member count');
  const paths = new Set();
  for (const member of value.members) {
    fields(member, ['resourceId', 'revisionId', 'relativePath', 'role', 'required']);
    assertResourceId(member.resourceId); assertBundlePath(member.relativePath); role(member.role);
    if (typeof member.required !== 'boolean') invalid('member required flag must be explicit');
    if (!draft || member.revisionId !== undefined) assertRevisionId(member.revisionId);
    if (paths.has(member.relativePath)) invalid('duplicate member path'); paths.add(member.relativePath);
  }
  if (!Array.isArray(value.unavailable ?? []) || (value.unavailable?.length ?? 0) + value.members.length > MAX_BUNDLE_MEMBERS) invalid('invalid unavailable members');
  for (const missing of value.unavailable ?? []) {
    fields(missing, ['relativePath', 'resourceId', 'role', 'required', 'reason']); role(missing.role);
    if (missing.relativePath !== undefined) { assertBundlePath(missing.relativePath); if (paths.has(missing.relativePath)) invalid('duplicate unavailable path'); paths.add(missing.relativePath); }
    if (missing.resourceId !== undefined) assertResourceId(missing.resourceId);
    if (missing.required !== undefined && typeof missing.required !== 'boolean') invalid('invalid missing required flag');
    if (typeof missing.reason !== 'string' || !missing.reason.trim() || missing.reason.length > 2048) invalid('missing member reason required');
  }
  for (const path of paths) {
    for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1)) {
      if (paths.has(path.slice(0, slash))) invalid('member paths conflict as file and directory');
    }
  }
  if (!Array.isArray(value.entrypoints ?? []) || (value.entrypoints?.length ?? 0) > MAX_BUNDLE_MEMBERS) invalid('invalid entrypoints');
  for (const entry of value.entrypoints ?? []) {
    fields(entry, ['revisionId', 'role']); assertRevisionId(entry.revisionId); role(entry.role);
    if (!value.members.some((member) => member.revisionId === entry.revisionId)) invalid('entrypoint must name a member');
  }
  if (value.dependencyCoverage !== undefined && !['unknown', 'partial', 'complete'].includes(value.dependencyCoverage)) invalid('invalid dependency coverage');
  if (value.restorability !== undefined && !['unknown', 'partial', 'verified'].includes(value.restorability)) invalid('invalid restorability');
  if (value.completeness !== undefined && !['complete', 'incomplete'].includes(value.completeness)) invalid('invalid completeness');
  const completeness = (value.unavailable ?? []).some((item) => item.required !== false) ? 'incomplete' : 'complete';
  if (!draft && value.completeness !== undefined && value.completeness !== completeness) invalid('completeness contradicts unavailable members');
  return { ...value, completeness, dependencyCoverage: value.dependencyCoverage ?? 'unknown', restorability: value.restorability ?? 'unknown' };
}

/** A URL identity cannot stand in for an actually retained required file. */
export async function verifyBundleStorage(root, value) {
  const store = createResourceStore(root);
  for (const member of value.members) {
    const revision = await store.readRevision(member.revisionId);
    if (revision.resourceId !== member.resourceId) invalid('member identity differs from its revision');
    if (member.required && revision.storageStatus !== 'owned_snapshot'
      && !value.unavailable?.some((missing) => missing.required !== false && (missing.relativePath === member.relativePath || missing.resourceId === member.resourceId))) invalid('unretained required member must be explicitly unavailable');
  }
  return value;
}

export async function readBundle(root, revisionId) {
  const store = createResourceStore(root); const revision = await store.readRevision(revisionId);
  if (revision.kind !== 'artifact-bundle' || revision.mediaType !== 'application/json' || revision.storageStatus !== 'owned_snapshot') invalid('owned JSON artifact-bundle required');
  let value; try { value = JSON.parse((await store.readContent(revisionId)).toString('utf8')); } catch { invalid('invalid manifest JSON'); }
  return verifyBundleStorage(root, validateBundleManifest(value));
}

/** Read the actual pinned closure; this does not grant permission or select members. */
export async function collectBundleClosure(root, revisionIds, { requireComplete = true, initialReferences = 0 } = {}) {
  const store = createResourceStore(root); const revisions = []; const visited = new Set(); const active = new Set(); let traversed = 0; let edges = initialReferences; let containsBundle = false;
  async function visit(id, depth) {
    if (active.has(id) || depth > 32) invalid('cyclic or excessively nested bundle');
    if (visited.has(id)) return;
    traversed += 1;
    const revision = await store.readRevision(id); visited.add(id); revisions.push(revision);
    if (containsBundle && traversed > MAX_BUNDLE_MEMBERS + 1) invalid('expanded bundle has too many members');
    if (revision.kind !== 'artifact-bundle') return;
    containsBundle = true;
    if (traversed > MAX_BUNDLE_MEMBERS + 1) invalid('expanded bundle has too many members');
    active.add(id);
    const bundle = await readBundle(root, id);
    if (requireComplete && bundle.completeness !== 'complete') invalid('required bundle member is unavailable');
    for (const member of bundle.members) {
      if (++edges > MAX_BUNDLE_MEMBERS) invalid('expanded bundle has too many member references');
      const child = await store.readRevision(member.revisionId);
      if (child.resourceId !== member.resourceId) invalid('member identity differs from its revision');
      await visit(member.revisionId, depth + 1);
    }
    active.delete(id);
  }
  for (const id of revisionIds) await visit(id, 0);
  if (containsBundle && revisions.reduce((total, item) => total + (item.byteLength ?? 0), 0) > MAX_BUNDLE_BYTES) invalid('expanded bundle exceeds 8GiB');
  return revisions;
}
