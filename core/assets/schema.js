import { FolioError } from '../errors.js';
import { assertId } from '../store/ids.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { MEDIA_TYPES } from './files.js';

export const ASSET_CHECKS = Object.freeze([
  Object.freeze({ id: 'asset.fixed-facts', severity: 'hard', instruction: '대상 이미지의 인물·물건·시각 설정을 설명서와 엔티티의 고정 사실에 대조한다.' }),
  Object.freeze({ id: 'asset.brief-fit', severity: 'block', instruction: '대상 이미지가 설명서의 필수 내용과 용도를 충족하는지 본다.' }),
  Object.freeze({ id: 'asset.quality', severity: 'advisory', instruction: '읽기와 사용에 걸리는 시각적 품질을 참고 의견으로 기록한다. 자동으로 교체하지 않는다.' }),
]);
export const HASH = /^sha256:[a-f0-9]{64}$/;
export const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const invalid = (text) => new FolioError('ASSET_INPUT_INVALID', text);
export const versionDigest = (v) => sha256(canonicalJson({ id: v.id, version: v.version, title: v.title, brief: v.brief, output: v.output }));

export function readBrief(brief, work = null) {
  if (!object(brief) || Buffer.byteLength(canonicalJson(brief)) > 64000) throw invalid('brief must be an object of at most 64000 bytes');
  const ids = brief.entities ?? [];
  if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw invalid('brief.entities must be unique IDs');
  for (const id of ids) { assertId(id, 'brief.entities'); if (work && !work.entities.has(id)) throw invalid(`entity not found: ${id}`); }
  if (brief.scope !== undefined) {
    const scope = brief.scope;
    if (!object(scope) || Object.keys(scope).some((k) => k !== 'nodeIds') || !Array.isArray(scope.nodeIds)
      || scope.nodeIds.length === 0 || scope.nodeIds.length > 500 || new Set(scope.nodeIds).size !== scope.nodeIds.length) throw invalid('brief.scope needs non-empty unique nodeIds');
    for (const id of scope.nodeIds) {
      assertId(id, 'brief.scope.nodeIds');
      if (work && !work.tree.nodes.has(id)) throw invalid(`scope node not found: ${id}`);
    }
  }
  return JSON.parse(JSON.stringify(brief));
}

export function readOrigin(origin = {}) {
  if (!object(origin) || Object.keys(origin).some((k) => !['provider', 'imageId', 'model'].includes(k))
    || Object.values(origin).some((v) => typeof v !== 'string' || v.length > 200)) throw invalid('origin contains only optional provider, imageId, model strings');
  return { ...origin };
}

export function readReview(checked, findings) {
  const expected = ASSET_CHECKS.map((c) => c.id).sort();
  if (!Array.isArray(checked) || canonicalJson([...checked].sort()) !== canonicalJson(expected)) throw invalid('checked must contain every asset check exactly once');
  if (!Array.isArray(findings) || findings.length > 200) throw invalid('findings must be an array');
  return findings.map((f) => {
    const check = ASSET_CHECKS.find((c) => c.id === f?.checkId);
    if (!object(f) || !check || Object.keys(f).some((k) => !['checkId', 'code', 'message', 'location'].includes(k))
      || typeof f.code !== 'string' || !f.code || f.code.length > 100 || typeof f.message !== 'string' || !f.message || f.message.length > 1000
      || (f.location !== undefined && (typeof f.location !== 'string' || f.location.length > 500))) throw invalid('finding needs a known checkId, code and message');
    return { ...f, severity: check.severity };
  });
}

/** 기록장의 의미도 검사한다. hash 사슬만 정상인 잘못된 버전·검토·승인은 정본으로 재생하지 않는다. */
export function validateVersion(r, prev) {
  assertId(r.id, 'asset.id');
  if (r.version !== (prev?.version ?? 0) + 1 || typeof r.title !== 'string' || r.title.length > 200) throw invalid('invalid asset version');
  readBrief(r.brief);
  const o = r.output;
  if (o !== null) {
    if (!object(o) || !Object.hasOwn(MEDIA_TYPES, o.mediaType)) throw invalid('invalid recorded output');
    readOrigin(o.origin);
    if (o.kind === 'file') {
      if (!HASH.test(o.contentHash) || o.file !== `files/${r.id}-${o.contentHash.slice(7)}.${MEDIA_TYPES[o.mediaType]}` || !Number.isInteger(o.bytes) || o.bytes < 1 || o.bytes > 20 * 1024 * 1024) throw invalid('invalid recorded file');
    } else if (o.kind === 'reference') {
      if (typeof o.uri !== 'string' || !/^[a-z][a-z0-9+.-]*:[^\s]+$/i.test(o.uri) || /^(file|data|javascript):/i.test(o.uri) || (o.reportedHash !== null && !HASH.test(o.reportedHash))) throw invalid('invalid recorded reference');
    } else throw invalid('invalid output kind');
  }
  if (versionDigest(r) !== r.versionDigest) throw invalid('versionDigest differs');
}
