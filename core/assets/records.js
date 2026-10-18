import { assertAssetScope } from './scope.js';
import { readEntities } from '../store/entities.js';
import { entityRefsFor, reviewContextChanged, validateEntityRefs } from './review-context.js';
import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { assertAssetDirs, inspectOutput } from './files.js';
import { ASSET_CHECKS, invalid, readReview, validateVersion } from './schema.js';

export const ASSETS_LEDGER = 'assets';

export function assertDecision(review, action, reason, feedback) {
  if (action === 'request_revision') {
    if (typeof feedback !== 'string' || !feedback.trim()) throw new FolioError('FEEDBACK_REQUIRED', 'asset revision needs author feedback');
    return;
  }
  if (action !== 'approve') throw invalid('action is approve or request_revision');
  if (review.findings.some((f) => f.severity === 'hard')) throw new FolioError('APPROVE_BLOCKED_BY_HARD', 'hard asset findings cannot be approved');
  if (review.findings.some((f) => f.severity === 'block') && (typeof reason !== 'string' || !reason.trim())) throw new FolioError('OVERRIDE_REASON_REQUIRED', 'block asset findings need an author reason');
}

/** hash 검증된 기록을 재생한다. 새 버전/새 검토는 이전 결정을 현재 승인으로 쓰지 않는다. */
export function replayAssets(records) {
  const states = new Map();
  const reviewIds = new Set();
  for (const r of records) {
    // The image pipeline shares this append-only ledger with managed versions.
    if (['image_result', 'image_decision', 'asset_receipt', 'asset_commit'].includes(r.type)) continue;
    const s = states.get(r.id);
    try {
      if (r.type === 'asset_version') {
        validateVersion(r, s?.version);
        assertAssetScope({ id: r.id, managed: true, brief: r.brief }, s?.binding?.nodeIds ?? []);
        states.set(r.id, { version: r, binding: s?.binding ?? null, review: null, decision: null, lastHash: r.hash });
        continue;
      }
      if (!s) throw invalid('asset record without a version');
      if (r.type === 'asset_binding') {
        if (!Array.isArray(r.nodeIds) || new Set(r.nodeIds).size !== r.nodeIds.length || r.nodeIds.some((id) => typeof id !== 'string')) throw invalid('invalid binding');
        assertAssetScope({ id: r.id, managed: true, brief: s.version.brief }, r.nodeIds);
        s.binding = r;
      } else if (r.type === 'asset_review') {
        if (r.version !== s.version.version || r.versionDigest !== s.version.versionDigest || r.contentHash !== s.version.output?.contentHash || !r.contentHash
          || typeof r.reviewId !== 'string' || !r.reviewId || r.reviewer?.sameHost !== true || r.reviewer?.independent !== false) throw invalid('invalid review version or reviewer');
        if (reviewIds.has(r.reviewId)) throw invalid('duplicate review id');
        reviewIds.add(r.reviewId);
        validateEntityRefs(r.entityRefs, s.version.brief);
        const raw = r.findings.map(({ severity: _s, ...f }) => f);
        if (canonicalJson(readReview(r.checked, raw)) !== canonicalJson(r.findings)) throw invalid('invalid finding severity');
        s.review = r; s.decision = null;
      } else if (r.type === 'asset_decision') {
        if (s.decision || !s.review || r.reviewId !== s.review.reviewId || r.version !== s.version.version || r.versionDigest !== s.version.versionDigest || r.contentHash !== s.review.contentHash || r.source !== 'user') throw invalid('decision does not match an undecided current review');
        assertDecision(s.review, r.action, r.reason, r.feedback); s.decision = r;
      } else throw invalid('unknown asset record type');
      s.lastHash = r.hash;
    } catch (e) { throw new FolioError('ASSET_RECORD_INVALID', e.message, { seq: r.seq, id: r.id }); }
  }
  return states;
}

export async function readManagedAssets(root, entities = null) {
  entities ??= (await readEntities(root)).entities;
  await assertAssetDirs(root);
  const records = await openLedger(root, ASSETS_LEDGER).readAll();
  const states = replayAssets(records);
  const assets = new Map();
  for (const [id, s] of states) {
    const v = s.version;
    const inspection = await inspectOutput(root, v.output);
    const entityRefs = entityRefsFor(v.brief, entities);
    const reviewStale = reviewContextChanged(s.review, entityRefs);
    let status = inspection.state;
    if (status === 'ready' && s.review) status = s.decision?.action === 'approve' ? 'approved' : s.decision?.action === 'request_revision' ? 'needs_revision' : 'reviewed';
    if (['approved', 'reviewed', 'needs_revision'].includes(status) && reviewStale) status = 'review_stale';
    const rev = sha256(canonicalJson({ record: s.lastHash, actualHash: inspection.actualHash, state: inspection.state, ...(entityRefs.length ? { entityRefs } : {}) }));
    const meta = { id, title: v.title, brief: v.brief, file: v.output?.file ?? null };
    assets.set(id, {
      id, managed: true, title: v.title, version: v.version, versionDigest: v.versionDigest,
      brief: v.brief, entities: v.brief.entities ?? [], file: v.output?.file ?? null,
      output: v.output, actualHash: inspection.actualHash, status, contentVerified: inspection.state === 'ready',
      review: s.review, decision: s.decision, approved: status === 'approved', nodeIds: s.binding?.nodeIds ?? [],
      rev, meta, metaText: canonicalJson(meta), path: null,
    });
  }
  return { assets, records };
}

/** payload/조회용. 바이트 확인과 호스트의 시각 검토 결과를 구분한다. */
export function assetView(a) {
  return {
    id: a.id, managed: Boolean(a.managed), title: a.title ?? '', version: a.version ?? null,
    rev: a.rev, brief: a.brief, nodeIds: a.nodeIds ?? [], status: a.status ?? 'legacy',
    output: a.output ?? (a.file ? { kind: 'legacy', file: a.file } : null),
    contentVerified: Boolean(a.contentVerified), approved: Boolean(a.approved),
    review: a.review ? { entityRefs: a.review.entityRefs ?? null, reviewId: a.review.reviewId, contentHash: a.review.contentHash, checked: a.review.checked, findings: a.review.findings, reviewer: a.review.reviewer } : null,
    decision: a.decision ? { action: a.decision.action, reviewId: a.decision.reviewId, source: a.decision.source, reason: a.decision.reason, feedback: a.decision.feedback } : null,
    checks: ASSET_CHECKS,
  };
}

/** 내용 손실·변경은 설정으로 해제할 수 없는 원고 저장/자산 승인 조건이다. 설명서만 있는 상태는 원고 집필을 허용한다. */
export function assertAssetIntegrity(assets) {
  const bad = assets.filter((a) => a.managed && ['content_changed', 'content_missing'].includes(a.status));
  if (bad.length) throw new FolioError('LOCK_HARD_VIOLATION', 'referenced asset bytes changed or disappeared', {
    findings: bad.map((a) => ({ checkId: 'asset.content-integrity', code: 'ASSET_CONTENT_CHANGED', severity: 'hard', message: a.id })),
  });
}
