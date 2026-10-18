import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { loadWorkConfig } from '../work/config.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkLock } from '../run/work-lock.js';
import { createRunStore, OPEN_STATES } from '../run/run-store.js';
import { readInterview, INTERVIEW_LEDGER } from './read.js';
import { keys, text, fieldList, normalizeAnswers, applyAnswers, applyConfirmation, revisionOf, interviewView } from './schema.js';

const ARGS = { get: ['op', 'revision'], history: ['op'], context: ['op', 'expectedRev', 'brief'], answer: ['op', 'expectedRev', 'answers'], confirm: ['op', 'expectedRev', 'fields', 'confirmation'] };

/** 원문 답, 확인, 반복 브리프를 구분하는 프로필 인터뷰의 공개 입구. */
export async function interviewCommand(root, input) {
  if (!ARGS[input?.op]) throw new FolioError('INTERVIEW_INPUT_INVALID', 'unknown operation');
  keys(input, ARGS[input.op]);
  return withWorkLock(root, async () => {
    await loadWorkConfig(root);
    const state = await readInterview(root);
    if (input.op === 'history') return { history: state.history };
    if (input.op === 'get') {
      if (input.revision !== undefined) {
        const profile = state.versions.get(input.revision);
        if (!profile) throw new FolioError('INTERVIEW_REVISION_UNKNOWN', input.revision);
        return interviewView(input.revision, profile);
      }
      return interviewView(state.revision, state.profile);
    }
    if (input.expectedRev !== state.revision) throw new FolioError('INTERVIEW_REV_STALE', 'read the current profile first');
    const open = (await createRunStore(root).list()).find((r) => r.error || OPEN_STATES.has(r.state));
    if (open) throw new FolioError('INTERVIEW_RUN_OPEN', 'finish or skip the writing run before changing the profile');
    await openWork(root);
    const ledger = openLedger(root, INTERVIEW_LEDGER);
    if (input.op === 'context') {
      await ledger.append({ type: 'interview_context', parentRev: state.revision, source: 'host', brief: text(input.brief, 'brief', 8000) });
      return interviewView(state.revision, state.profile);
    }
    const answers = input.op === 'answer' ? normalizeAnswers(input.answers) : null;
    const fields = input.op === 'confirm' ? fieldList(input.fields) : null;
    const confirmation = input.op === 'confirm' ? text(input.confirmation, 'author confirmation') : null;
    const profile = answers ? applyAnswers(state.profile, answers) : applyConfirmation(state.profile, fields, confirmation);
    const revision = revisionOf(state.revision, profile);
    await ledger.append({ type: answers ? 'interview_answer' : 'interview_confirmation', parentRev: state.revision, revision, source: 'user', profile,
      ...(answers ? { answers } : { fields, confirmation }) });
    return interviewView(revision, profile);
  });
}
