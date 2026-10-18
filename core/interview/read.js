import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { canonicalJson } from '../util/hash.js';
import { applyAnswers, applyConfirmation, fieldList, normalizeAnswers, text, revisionOf } from './schema.js';

export const INTERVIEW_LEDGER = 'interview';

/** 기록된 답/확인에서 상태를 다시 계산한다. snapshot의 confirmed 플래그를 신뢰하지 않는다. */
export async function readInterview(root) {
  const records = await openLedger(root, INTERVIEW_LEDGER).readAll();
  const state = { revision: null, profile: {}, versions: new Map(), history: [] };
  for (const r of records) {
    try {
      if (r.parentRev !== state.revision) throw new Error('stale interview record');
      if (r.type === 'interview_context') {
        if (r.source !== 'host') throw new Error('context is not an answer');
        text(r.brief, 'context', 8000);
      } else {
        if (r.source !== 'user') throw new Error('answers and confirmations need the author');
        let profile;
        if (r.type === 'interview_answer') profile = applyAnswers(state.profile, normalizeAnswers(r.answers));
        else if (r.type === 'interview_confirmation') profile = applyConfirmation(state.profile, fieldList(r.fields), text(r.confirmation, 'confirmation'));
        else throw new Error('unknown interview record');
        if (r.revision !== revisionOf(state.revision, profile) || canonicalJson(r.profile) !== canonicalJson(profile)) throw new Error('interview state differs from answers/confirmation');
        state.revision = r.revision; state.profile = profile;
        state.versions.set(r.revision, structuredClone(profile));
      }
      state.history.push(r);
    } catch (error) { throw new FolioError('INTERVIEW_RECORD_INVALID', error.message, { seq: r.seq }); }
  }
  return state;
}
