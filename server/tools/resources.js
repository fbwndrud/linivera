import { FolioError } from '../../core/errors.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { importResourceFile } from '../../core/resources/intake.js';
import { importManagedAsset } from '../../core/resources/asset-import.js';
import { importResourceBundle } from '../../core/resources/bundle-import.js';
import { inspectStructure, STRUCTURE_FORMATS } from '../../core/resources/structures.js';
import { normalizeStructure } from '../../core/resources/structure-bindings.js';
import { ID, ids, definition, argsFor, rule } from './resource-schema.js';
export const resourcesDefinition = definition('folio_resources', '공통 자원 후보 등록·읽기·원본 선택. importFile은 최대2GiB 파일을 보존한다. 작은 read는8MiB까지이며 큰 파일은 describe/materialize를 사용한다. importBundle은 명시한 파일/판본을 묶는다. inspectStructure는 보관한 구조를 읽는다. 반입은 승인/입력 선택을 자동 수행하지 않는다.', ['propose', 'read', 'decideSource', 'importFile', 'importAsset', 'describe', 'materialize', 'importBundle', 'inspectStructure', 'normalizeStructure'], {
  format: { type: 'string', enum: STRUCTURE_FORMATS, description: 'Explicit retained structure format; reads bytes without fetching references or executing a native project.' }, sourceRevisionId: ID,
  structureBindings: { type: 'array', maxItems: 4096, items: { type: 'object', additionalProperties: false, required: ['referenceKey', 'revisionId'], properties: { referenceKey: ID, revisionId: ID } } },
  resourceId: ID, kind: ID, parents: { ...ids, minItems: 0 }, schemaRef: ID, revisionId: ID,
  path: { ...ID, description: 'Absolute path of one chosen regular local file, at most 2GiB. Symlinks are refused.' }, output: ID, mediaType: ID, contentHash: ID,
  manifest: { type: 'object', additionalProperties: true }, pathMappings: { type: 'array', maxItems: 4096, items: { type: 'object', additionalProperties: false, required: ['relativePath', 'path', 'mediaType'], properties: { relativePath: ID, path: ID, mediaType: ID, contentHash: ID } } },
  assetId: { ...ID, description: 'Existing managed asset ID to retain as the common Resource ID.' }, expectedRev: ID,
  owned: { type: 'object', additionalProperties: false, required: ['mediaType'], oneOf: [{ required: ['bytes'] }, { required: ['base64'] }], properties: { bytes: { type: 'string' }, base64: { type: 'string', maxLength: 11184812 }, mediaType: { type: 'string', maxLength: 255 } } },
  external: { type: 'object', additionalProperties: false, required: ['uri'], properties: { uri: ID, reportedRevision: ID } },
  expectedSelectionRevision: { type: ['string', 'null'] },
  action: { type: 'object', additionalProperties: false, required: ['actor', 'type'], properties: { actor: { type: 'string', enum: ['user'] }, type: { type: 'string', enum: ['select', 'deselect'] }, reason: { type: 'string', maxLength: 8192 } } },
});
const rules = { propose: rule(['resourceId', 'kind'], ['parents', 'owned', 'external', 'schemaRef']), read: rule(['revisionId']), decideSource: rule(['revisionId', 'expectedSelectionRevision', 'action']),
  importFile: rule(['resourceId', 'kind', 'path', 'mediaType'], ['parents', 'schemaRef', 'contentHash']), importAsset: rule(['assetId', 'expectedRev']), describe: rule(['revisionId']), materialize: rule(['revisionId', 'output']), importBundle: rule(['resourceId', 'manifest'], ['pathMappings', 'parents', 'schemaRef']), inspectStructure: rule(['revisionId', 'format']), normalizeStructure: rule(['resourceId', 'sourceRevisionId', 'format', 'structureBindings']) };
export async function resourcesTool(root, input) {
  const { op, values } = argsFor(input, rules); const store = createResourceStore(root);
  if (op === 'inspectStructure') return inspectStructure(root, values);
  if (op === 'normalizeStructure') return normalizeStructure(root, values);
  if (op === 'importFile') return importResourceFile(root, values);
  if (op === 'importAsset') return importManagedAsset(root, values);
  if (op === 'importBundle') return importResourceBundle(root, values);
  if (op === 'describe') return store.describe(values.revisionId);
  if (op === 'materialize') return store.materialize(values.revisionId, values.output);
  if (op === 'propose') {
    if (values.owned) {
      const owned = values.owned;
      if (Object.hasOwn(owned, 'base64')) {
        if (Object.hasOwn(owned, 'bytes') || typeof owned.base64 !== 'string' || owned.base64.length > 11184812) throw new FolioError('RESOURCE_CONTENT_INVALID', 'canonical base64 only; bytes/base64 are mutually exclusive');
        const bytes = Buffer.from(owned.base64, 'base64');
        if (bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== owned.base64) throw new FolioError('RESOURCE_CONTENT_INVALID', 'invalid or oversized base64');
        values.owned = { ...owned, bytes }; delete values.owned.base64;
      }
    }
    return store.propose(values);
  }
  if (op === 'decideSource') return store.decideSource(values);
  const revision = await store.readRevision(values.revisionId);
  if (revision.storageStatus !== 'owned_snapshot') return { revision, content: null };
  const bytes = await store.readContent(values.revisionId);
  return ['text/plain', 'application/json'].includes(revision.mediaType) ? { revision, content: bytes.toString('utf8') } : { revision, base64: bytes.toString('base64'), encoding: 'base64' };
}
