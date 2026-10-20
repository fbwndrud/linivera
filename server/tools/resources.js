import { FolioError } from '../../core/errors.js';
import { createResourceStore } from '../../core/resources/revisions.js';
import { importResourceFile } from '../../core/resources/intake.js';
import { importManagedAsset } from '../../core/resources/asset-import.js';
import { ID, ids, definition, argsFor, rule } from './resource-schema.js';
export const resourcesDefinition = definition('folio_resources', '공통 자원 후보 등록·읽기·원본 선택. importFile은 선택한 로컬 파일 하나를 최대8MiB로 보존하며 importAsset은 기존 관리 자산의 같은 ID/판본 대응을 보존한다. 둘 다 승인/입력 선택을 자동 수행하지 않는다. decideSource는 실제 사용자의 명시적 지시만 전달한다.', ['propose', 'read', 'decideSource', 'importFile', 'importAsset'], {
  resourceId: ID, kind: ID, parents: { ...ids, minItems: 0 }, schemaRef: ID, revisionId: ID,
  path: { ...ID, description: 'Absolute path of one chosen regular local file, at most 8MiB. Symlinks are refused.' }, mediaType: ID, contentHash: ID,
  assetId: { ...ID, description: 'Existing managed asset ID to retain as the common Resource ID.' }, expectedRev: ID,
  owned: { type: 'object', additionalProperties: false, required: ['mediaType'], oneOf: [{ required: ['bytes'] }, { required: ['base64'] }], properties: { bytes: { type: 'string' }, base64: { type: 'string', maxLength: 11184812 }, mediaType: { type: 'string', enum: ['text/plain', 'application/json', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/wav', 'audio/mpeg', 'video/mp4'] } } },
  external: { type: 'object', additionalProperties: false, required: ['uri'], properties: { uri: ID, reportedRevision: ID } },
  expectedSelectionRevision: { type: ['string', 'null'] },
  action: { type: 'object', additionalProperties: false, required: ['actor', 'type'], properties: { actor: { type: 'string', enum: ['user'] }, type: { type: 'string', enum: ['select', 'deselect'] }, reason: { type: 'string', maxLength: 8192 } } },
});
const rules = { propose: rule(['resourceId', 'kind'], ['parents', 'owned', 'external', 'schemaRef']), read: rule(['revisionId']), decideSource: rule(['revisionId', 'expectedSelectionRevision', 'action']),
  importFile: rule(['resourceId', 'kind', 'path', 'mediaType'], ['parents', 'schemaRef', 'contentHash']), importAsset: rule(['assetId', 'expectedRev']) };
export async function resourcesTool(root, input) {
  const { op, values } = argsFor(input, rules); const store = createResourceStore(root);
  if (op === 'importFile') return importResourceFile(root, values);
  if (op === 'importAsset') return importManagedAsset(root, values);
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
