import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { canonicalJson } from '../util/hash.js';

export const INITIAL_WORKSPACE_CHECKPOINT = Object.freeze({ seq: 0, hash: 'genesis' });
const KINDS = new Set(['source-selection', 'input-selection', 'result-publication', 'result-group-publication', 'grant-issued', 'grant-revoked']);
export function sameCheckpoint(a, b) { return a?.seq === b?.seq && a?.hash === b?.hash; }
function fold(markers) {
  const sourceSelections = Object.create(null);
  const inputSelections = Object.create(null);
  const publications = [];
  const groupPublications = [];
  const grants = Object.create(null);
  for (const marker of markers) {
    if (!KINDS.has(marker.type) || !marker.payload || typeof marker.payload !== 'object') throw new FolioError('WORKSPACE_STATE_INVALID', 'invalid state marker');
    const checkpoint = { seq: marker.seq, hash: marker.hash };
    if (marker.type === 'source-selection') {
      const payload = marker.payload;
      sourceSelections[payload.resourceId] = { ...payload, selectionRevision: marker.hash, checkpoint };
    } else if (marker.type === 'input-selection') inputSelections[marker.payload.scopeId] = { ...marker.payload, scopeSelectionRevision: marker.hash, checkpoint };
    else if (marker.type === 'result-publication') publications.push({ ...marker.payload, checkpoint });
    else if (marker.type === 'result-group-publication') groupPublications.push({ ...marker.payload, checkpoint });
    else if (marker.type === 'grant-issued') grants[marker.payload.grantId] = { ...marker.payload, revoked: false, checkpoint };
    else grants[marker.payload.grantId] = { ...(grants[marker.payload.grantId] ?? {}), revoked: true, revocation: marker.payload, checkpoint };
  }
  const last = markers.at(-1);
  return { checkpoint: last ? { seq: last.seq, hash: last.hash } : { ...INITIAL_WORKSPACE_CHECKPOINT }, markers, sourceSelections, inputSelections, publications, groupPublications, grants };
}
/** 검증한 기록장 prefix만 fold한다. 도메인별 참조 검증은 caller가 맡는다. */
/** @param {string} root @param {{checkpoint?: {seq:number, hash:string}}} [options] */
export async function readWorkspaceState(root, { checkpoint } = {}) {
  const records = await openLedger(root, 'workspace-state').readAll();
  if (checkpoint === undefined) return fold(records);
  if (!checkpoint || !Number.isSafeInteger(checkpoint.seq) || checkpoint.seq < 0 || (checkpoint.seq === 0 ? checkpoint.hash !== 'genesis' : records[checkpoint.seq - 1]?.hash !== checkpoint.hash)) throw new FolioError('WORKSPACE_CHECKPOINT_INVALID', 'checkpoint is not present in verified history');
  return fold(records.slice(0, checkpoint.seq));
}
/**
 * 내부 통합 seam: 같은 work lock 안에서 참조/권한을 검증하고 append한다.
 * callback({state, append})의 append는 callback 동안만 유효하다. 중첩 withWorkLock 금지.
 * append는 {kind,payload,expectedCheckpoint?}를 받고 {seq,hash}를 반환한다.
 */
export async function withWorkspaceStateTransaction(root, callback) {
  return withWorkLock(root, async () => {
    const ledger = openLedger(root, 'workspace-state');
    let state = await readWorkspaceState(root);
    let active = true;
    let pending = Promise.resolve();
    const append = (input) => {
      const result = pending.then(async () => {
        if (!active) throw new FolioError('WORKSPACE_TRANSACTION_CLOSED', 'append capability has expired');
        if (!input || !KINDS.has(input.kind) || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new FolioError('WORKSPACE_STATE_INVALID', 'invalid marker kind or payload');
        if (input.expectedCheckpoint !== undefined && !sameCheckpoint(input.expectedCheckpoint, state.checkpoint)) throw new FolioError('WORKSPACE_CHECKPOINT_CONFLICT', 'workspace has changed');
        let payload;
        try { payload = JSON.parse(canonicalJson(input.payload)); } catch { throw new FolioError('WORKSPACE_STATE_INVALID', 'payload must be JSON'); }
        const record = await ledger.append({ type: input.kind, payload });
        state = fold([...state.markers, record]);
        return { seq: record.seq, hash: record.hash };
      });
      pending = result.then(() => {}, () => {});
      return result;
    };
    try { return await callback({ state, append }); }
    finally { active = false; await pending; }
  });
}
export async function appendStateMarker(root, input) {
  return withWorkspaceStateTransaction(root, ({ append }) => append(input));
}
