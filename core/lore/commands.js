import { loadWorkConfig } from '../work/config.js';
import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { normalizeSnapshot, keys, text } from './schema.js';
import { sealAnchors, sameSealedSnapshot, assertSealedAnchors } from './anchors.js';
import { assertAdoptions } from './qualification.js';
import { readLore, assertIdentities, revisionOf, LORE_LEDGER } from './read.js';

const ARGS = { get: ['op', 'revision', 'proposalId'], history: ['op'], propose: ['op', 'expectedRev', 'snapshot'], decide: ['op', 'expectedRev', 'proposalId', 'action', 'decision'] };

/** 제안·승인·공개가 하나의 작품 잠금과 추가만 되는 기록장을 따른다. */
export async function loreCommand(root, input) {
  if (!ARGS[input?.op]) throw new FolioError('LORE_INPUT_INVALID', 'unknown operation');
  keys(input, ARGS[input.op]);
  return withWorkLock(root, async () => {
    await loadWorkConfig(root);
    const state = await readLore(root);
    if (input.op === 'history') return { history: state.history };
    if (input.op === 'get') {
      if (input.proposalId !== undefined) {
        if (input.revision !== undefined) throw new FolioError('LORE_INPUT_INVALID', 'choose a proposal or a publication');
        const p = state.proposals.get(input.proposalId);
        if (!p) throw new FolioError('LORE_PROPOSAL_UNKNOWN', String(input.proposalId));
        return { proposalId: p.proposalId, parentRev: p.parentRev, digest: p.digest, snapshot: p.snapshot, decided: state.decisions.has(p.proposalId) };
      }
      if (input.revision !== undefined) {
        const p = state.publications.get(input.revision);
        if (!p) throw new FolioError('LORE_REVISION_UNKNOWN', input.revision);
        return { revision: p.revision, parentRev: p.parentRev, version: p.version, snapshot: p.snapshot, source: p.source, decision: p.decision };
      }
      const work = await openWork(root, { allowMissingSources: true });
      return work.lore ?? { revision: null, version: 0, evidence: [], claims: [], canon: [], perspectives: [], questions: [], staleEvidence: [], staleAdopted: [] };
    }
    if (input.expectedRev !== state.revision) throw new FolioError('LORE_REV_STALE', 'read the current revision first');
    const open = (await createRunStore(root).list()).find((r) => r.error || OPEN_STATES.has(r.state));
    if (open) throw new FolioError('LORE_RUN_OPEN', 'finish or skip the writing run before changing lore');
    const work = await openWork(root);
    const receipts = await openLedger(root, 'receipts').readAll();
    const ledger = openLedger(root, LORE_LEDGER);
    if (input.op === 'propose') {
      const snapshot = sealAnchors(normalizeSnapshot(input.snapshot), work, receipts);
      assertSealedAnchors(snapshot); assertAdoptions(snapshot); assertIdentities(state.identities, snapshot);
      const proposalId = `lore-${randomUUID()}`;
      await ledger.append({ type: 'lore_proposal', proposalId, parentRev: state.revision, source: 'host', snapshot, digest: revisionOf(state.revision, snapshot) });
      return { proposalId, parentRev: state.revision, snapshot, adopted: false };
    }
    const proposal = state.proposals.get(input.proposalId);
    if (!proposal) throw new FolioError('LORE_PROPOSAL_UNKNOWN', String(input.proposalId));
    if (state.decisions.has(input.proposalId)) throw new FolioError('LORE_ALREADY_DECIDED', input.proposalId);
    const decision = text(input.decision, 'author decision');
    if (!['approve', 'reject'].includes(input.action)) throw new FolioError('LORE_INPUT_INVALID', 'choose approve or reject');
    if (input.action === 'reject') {
      await ledger.append({ type: 'lore_rejection', proposalId: input.proposalId, parentRev: state.revision, source: 'user', decision });
      return { rejected: true, revision: state.revision };
    }
    if (proposal.parentRev !== state.revision) throw new FolioError('LORE_REV_STALE', 'propose again against the current revision');
    const sealed = sealAnchors(proposal.snapshot, work, receipts);
    if (!sameSealedSnapshot(proposal.snapshot, sealed)) throw new FolioError('LORE_ANCHOR_STALE', 'the proposal changed during validation');
    assertAdoptions(sealed); assertIdentities(state.identities, sealed);
    const publication = { type: 'lore_publication', proposalId: input.proposalId, parentRev: state.revision,
      revision: proposal.digest, version: state.version + 1, snapshot: sealed, source: 'user', decision };
    await ledger.append(publication);
    return { revision: publication.revision, version: publication.version };
  });
}
