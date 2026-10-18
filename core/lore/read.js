import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { normalizeSnapshot } from './schema.js';
import { assertAdoptions } from './qualification.js';
import { assertSealedAnchors } from './anchors.js';

export const LORE_LEDGER = 'lore';
export const revisionOf = (parentRev, snapshot) => sha256(canonicalJson({ parentRev, snapshot }));
const signature = (kind, row) => canonicalJson(kind === 'evidence' ? row : kind === 'claims'
  ? { entityId: row.entityId, text: row.text, perspectiveId: row.perspectiveId }
  : { text: row.text, perspectiveId: row.perspectiveId });

/** 한 번 공개된 ID의 의미를 다른 판본에서 재사용할 수 없다. */
export function assertIdentities(identities, snapshot) {
  for (const kind of ['evidence', 'claims', 'questions']) for (const row of snapshot[kind]) {
    const before = identities.get(`${kind}:${row.id}`);
    if (before !== undefined && before !== signature(kind, row)) throw new FolioError('LORE_ID_REUSED', row.id);
  }
}

/** 현재 파일 없이도 불변 공개 이력을 재생한다. hash뿐 아니라 기록의 의미도 검증한다. */
export async function readLore(root) {
  const records = await openLedger(root, LORE_LEDGER).readAll();
  const state = { revision: null, version: 0, current: null, proposals: new Map(), decisions: new Set(), publications: new Map(), identities: new Map(), history: [] };
  for (const r of records) {
    try {
      if (r.type === 'lore_proposal') {
        if (typeof r.proposalId !== 'string' || !r.proposalId || state.proposals.has(r.proposalId) || r.source !== 'host' || r.parentRev !== state.revision) throw new Error('invalid proposal');
        const snapshot = normalizeSnapshot(r.snapshot); assertAdoptions(snapshot); assertSealedAnchors(snapshot);
        if (canonicalJson(snapshot) !== canonicalJson(r.snapshot) || r.digest !== revisionOf(r.parentRev, snapshot)) throw new Error('proposal digest differs');
        assertIdentities(state.identities, snapshot);
        state.proposals.set(r.proposalId, r);
      } else if (r.type === 'lore_publication' || r.type === 'lore_rejection') {
        const proposal = state.proposals.get(r.proposalId);
        if (!proposal || state.decisions.has(r.proposalId) || r.source !== 'user' || typeof r.decision !== 'string' || !r.decision.trim() || r.parentRev !== state.revision) throw new Error('invalid decision');
        if (r.type === 'lore_publication') {
          if (proposal.parentRev !== state.revision || r.revision !== proposal.digest || r.version !== state.version + 1) throw new Error('stale publication');
          if (canonicalJson(r.snapshot) !== canonicalJson(proposal.snapshot)) throw new Error('publication differs from proposal');
          assertIdentities(state.identities, r.snapshot);
          state.revision = r.revision; state.version = r.version; state.current = r;
          state.publications.set(r.revision, r);
          for (const kind of ['evidence', 'claims', 'questions']) for (const row of r.snapshot[kind]) state.identities.set(`${kind}:${row.id}`, signature(kind, row));
        }
        state.decisions.add(r.proposalId);
      } else throw new Error('unknown lore record');
      state.history.push({ type: r.type, proposalId: r.proposalId, revision: r.revision ?? null, at: r.at, seq: r.seq });
    } catch (error) { throw new FolioError('LORE_RECORD_INVALID', error.message, { seq: r.seq }); }
  }
  return state;
}
