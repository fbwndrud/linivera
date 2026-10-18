import { nodeReceiptValid } from './receipt.js';
import { keys, id } from './schema.js';
import { FolioError } from '../errors.js';
import { bindSource, verifySourceLink } from '../evidence/binding.js';
import { checkSourceQuote } from '../evidence/source-quote.js';
import { resolveQuote } from '../occurrences/anchor.js';
import { sha256, canonicalJson } from '../util/hash.js';
import { lastCommits } from '../ledger/receipts.js';

const fail = (code, id) => { throw new FolioError(code, id); };
const hashPattern = /^sha256:[a-f0-9]{64}$/;

/** 공개 전에만 현재 파일과 대조한다. 역사 재생에는 사용하지 않는다. */
export function sealAnchors(snapshot, work, receipts) {
  const copy = structuredClone(snapshot);
  const commits = lastCommits(receipts);
  for (const e of copy.evidence) {
    if (e.perspectiveId && !work.entities.has(e.perspectiveId)) fail('LORE_ENTITY_UNKNOWN', e.perspectiveId);
    const a = e.anchor;
    if (!a) continue;
    if (a.kind === 'source') {
      const source = work.sources.get(a.id);
      if (!source || source.rev !== a.rev) fail('LORE_ANCHOR_STALE', e.id);
      const checked = checkSourceQuote(source, a.quote);
      if (!checked.ok) fail('LORE_ANCHOR_INVALID', e.id);
      const binding = bindSource(source, a.quote);
      const span = a.span ?? binding.span;
      if (span === null) fail('LORE_ANCHOR_AMBIGUOUS', e.id);
      if (!verifySourceLink(source, { ...binding, span }).ok) fail('LORE_ANCHOR_INVALID', e.id);
      if (a.hash !== undefined && a.hash !== binding.sourceHash) fail('LORE_ANCHOR_STALE', e.id);
      e.anchor = { kind: a.kind, id: a.id, rev: a.rev, hash: binding.sourceHash, quote: a.quote, span };
    } else {
      const node = work.tree.nodes.get(a.id); const commit = commits.get(a.id);
      if (!node || sha256(node.body) !== a.rev || !commit || commit.committedHash !== a.rev) fail('LORE_ANCHOR_STALE', e.id);
      const found = resolveQuote(node.body, { quote: a.quote, before: a.before, after: a.after });
      const span = a.span ?? (found.ok ? { kind: 'text', start: found.start, end: found.start + a.quote.length } : null);
      if (!span || span.kind !== 'text' || !Number.isInteger(span.start) || !Number.isInteger(span.end)
        || span.start < 0 || span.end <= span.start || node.body.slice(span.start, span.end) !== a.quote) fail('LORE_ANCHOR_INVALID', e.id);
      if (a.hash !== undefined && a.hash !== a.rev) fail('LORE_ANCHOR_STALE', e.id);
      const receiptId = a.receiptId ?? commit.receiptId;
      if (!nodeReceiptValid(receipts, a.id, a.rev, receiptId)) fail('LORE_NODE_RECEIPT_INVALID', e.id);
      e.anchor = { kind: a.kind, id: a.id, rev: a.rev, hash: a.rev, quote: a.quote, span, receiptId };
    }
  }
  for (const c of copy.claims) if (!work.entities.has(c.entityId) || (c.perspectiveId && !work.entities.has(c.perspectiveId))) fail('LORE_ENTITY_UNKNOWN', c.id);
  for (const q of copy.questions) {
    if (q.perspectiveId && !work.entities.has(q.perspectiveId)) fail('LORE_ENTITY_UNKNOWN', q.id);
    if (q.nodeIds.some((id) => !work.tree.nodes.has(id))) fail('LORE_NODE_UNKNOWN', q.id);
  }
  return copy;
}

export function assertSealedAnchors(snapshot) {
  for (const e of snapshot.evidence) {
    const a = e.anchor;
    if (!a) continue;
    if (!hashPattern.test(a.hash) || !a.span || (a.kind === 'node' && (typeof a.receiptId !== 'string' || !a.receiptId || a.hash !== a.rev))) fail('LORE_RECORD_INVALID', e.id);
    keys(a.span, a.span.kind === 'text' ? ['kind', 'start', 'end'] : ['kind', 'id']);
    if (a.span.kind === 'text') {
      if (!Number.isSafeInteger(a.span.start) || !Number.isSafeInteger(a.span.end) || a.span.start < 0 || a.span.end - a.span.start !== a.quote.length) fail('LORE_RECORD_INVALID', e.id);
    } else if (a.span.kind === 'declared' && a.kind === 'source') id(a.span.id);
    else fail('LORE_RECORD_INVALID', e.id);
  }
}

export function anchorIsCurrent(a, work, receipts = []) {
  if (!a) return true;
  if (a.kind === 'source') return verifySourceLink(work.sources.get(a.id), { sourceRev: a.rev, sourceHash: a.hash, quote: a.quote, span: a.span }).ok;
  const node = work.tree.nodes.get(a.id);
  return Boolean(node && sha256(node.body) === a.rev && a.hash === a.rev && node.body.slice(a.span.start, a.span.end) === a.quote && nodeReceiptValid(receipts, a.id, a.rev, a.receiptId));
}

/** 당시 고정한 인용을 새 버전으로 다시 고정하지 않는다. */
export const sameSealedSnapshot = (before, after) => canonicalJson(before) === canonicalJson(after);
