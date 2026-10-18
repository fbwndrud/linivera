import { assetUsages } from './view.js';
import { assertAssetScope } from './scope.js';
import { entityRefsFor } from './review-context.js';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { assertId } from '../store/ids.js';
import { openWork } from '../store/work.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { assertAssetWriterAvailable } from './write-gate.js';
import { assertFeature } from '../work/features.js';
import { assertAssetDirs, prepareOutput, storeOutput } from './files.js';
import { HASH, readBrief, readOrigin, readReview, versionDigest, invalid } from './schema.js';
import { ASSETS_LEDGER, assertDecision, assetView } from './records.js';

const ARGS = {
  add: { required: ['id', 'brief'], allowed: ['id', 'brief', 'title'] },
  update: { required: ['id', 'expectedRev', 'brief'], allowed: ['id', 'expectedRev', 'brief', 'title'] },
  put: { required: ['id', 'expectedRev', 'mediaType'], allowed: ['id', 'expectedRev', 'path', 'uri', 'mediaType', 'contentHash', 'origin'] },
  attach: { required: ['id', 'expectedRev', 'nodeIds'], allowed: ['id', 'expectedRev', 'nodeIds'] },
  review: { required: ['id', 'expectedRev', 'contentHash', 'checked', 'findings'], allowed: ['id', 'expectedRev', 'contentHash', 'checked', 'findings'] },
  decide: { required: ['id', 'expectedRev', 'reviewId', 'action'], allowed: ['id', 'expectedRev', 'reviewId', 'action', 'reason', 'feedback'] },
};

function assertReady(a) {
  if (!a.contentVerified || a.output?.kind !== 'file') throw new FolioError('ASSET_CONTENT_UNVERIFIED', 'a current, unchanged file snapshot is required', { status: a.status });
}

/**
 * 공개 쓰기 입구. 모든 검증 후 파일 사본을 확보하고 정본 기록 하나를 추가한다.
 * @param {string} root
 * @param {{ op: string, [key: string]: any }} input
 * @param {{ hooks?: { afterSnapshot?: () => any } }} options
 */
export async function changeAsset(root, { op, ...args }, { hooks = {} } = {}) {
  const rule = ARGS[op];
  if (!rule) throw invalid('unknown asset operation');
  if (rule.required.some((k) => args[k] === undefined) || Object.keys(args).some((k) => !rule.allowed.includes(k))) throw invalid(`invalid arguments for ${op}`);
  await assertAssetDirs(root);
  return withWorkLock(root, async () => {
    await assertAssetDirs(root);
    const work = await openWork(root); assertFeature(work.config, 'assets');
    const { id } = args; assertId(id, 'asset.id');
    if (id.length > 100) throw invalid('asset ID is too long');
    await assertAssetWriterAvailable(root, id);
    const a = work.assets.get(id);
    if (op === 'add' && a) throw new FolioError('ASSET_EXISTS', id);
    if (op !== 'add') {
      if (!a) throw new FolioError('ASSET_NOT_FOUND', id);
      if (!a.managed) throw new FolioError('ASSET_LEGACY_READ_ONLY', 'register a new logical ID for managed versions');
      if (args.expectedRev !== a.rev) throw new FolioError('ASSET_REV_STALE', 'read the current asset and present the changed version again');
    }
    const ledger = openLedger(root, ASSETS_LEDGER);
    /** @type {Record<string, any>} */
    let record; let bytes = null;
    if (['add', 'update', 'put'].includes(op)) {
      const title = args.title ?? a?.title ?? '';
      if (typeof title !== 'string' || title.length > 200) throw invalid('invalid title');
      const brief = op === 'put' ? a.brief : readBrief(args.brief, work);
      if (a) assertAssetScope({ id, managed: true, brief }, assetUsages(work, a).map((u) => u.nodeId));
      let output = a?.output ?? null;
      if (op === 'put') {
        if (args.contentHash !== undefined && !HASH.test(args.contentHash)) throw invalid('invalid contentHash');
        const prepared = await prepareOutput(root, id, { path: args.path, uri: args.uri, mediaType: args.mediaType, contentHash: args.contentHash, origin: readOrigin(args.origin) });
        output = prepared.output; bytes = prepared.bytes;
      }
      record = { type: 'asset_version', id, version: (a?.version ?? 0) + 1, title, brief, output };
      record.versionDigest = versionDigest(record);
    } else if (op === 'attach') {
      const ids = args.nodeIds;
      if (!Array.isArray(ids) || ids.length > 500 || new Set(ids).size !== ids.length || ids.some((n) => !work.tree.nodes.has(n))) throw invalid('nodeIds must name existing unique nodes');
      assertAssetScope(a, ids);
      record = { type: 'asset_binding', id, nodeIds: ids };
    } else if (op === 'review') {
      assertReady(a);
      if (args.contentHash !== a.output.contentHash) throw new FolioError('ASSET_HASH_MISMATCH', 'review must name the current contentHash');
      readBrief(a.brief, work);
      const findings = readReview(args.checked, args.findings);
      record = { type: 'asset_review', id, entityRefs: entityRefsFor(a.brief, work.entities), version: a.version, versionDigest: a.versionDigest, contentHash: a.output.contentHash,
        reviewId: `arev-${randomUUID()}`, checked: [...args.checked], findings, reviewer: { sameHost: true, independent: false } };
    } else {
      assertReady(a);
      if (a.status === 'review_stale' || !a.review || args.reviewId !== a.review.reviewId) throw new FolioError('ASSET_REVIEW_STALE', 'decide on the latest review of this version');
      if (a.decision) throw new FolioError('ASSET_ALREADY_DECIDED', 'this review already has an author decision; submit a new review or version');
      assertDecision(a.review, args.action, args.reason, args.feedback);
      record = { type: 'asset_decision', id, version: a.version, versionDigest: a.versionDigest, contentHash: a.output.contentHash,
        reviewId: a.review.reviewId, action: args.action, source: 'user', ...(args.reason !== undefined ? { reason: args.reason } : {}), ...(args.feedback !== undefined ? { feedback: args.feedback } : {}) };
    }
    await storeOutput(root, record.output ?? null, bytes);
    await hooks.afterSnapshot?.();
    await ledger.append(record);
    return { asset: assetView((await openWork(root)).assets.get(id)) };
  });
}
