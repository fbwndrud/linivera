import { FolioError } from '../errors.js';
import { openLedger } from '../ledger/ledger.js';
import { withWorkspaceStateTransaction, sameCheckpoint } from '../publications/state.js';
import { createResourceStore } from '../resources/revisions.js';
import { assertResourceId } from '../resources/schema.js';
import { canonicalJson, sha256 } from '../util/hash.js';

function invalid(message) { throw new FolioError('SESSION_INVALID', message); }
const headOf = (records) => records.length ? { seq: records.at(-1).seq, hash: records.at(-1).hash } : null;
const ledgerFor = (root, sessionId) => { assertResourceId(sessionId); return openLedger(root, 'session-' + sha256(sessionId).slice(7)); };
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('unknown session observation field');
}
function interval(event) {
  if (![event.start, event.end].every((time) => Number.isFinite(time) && time >= 0) || event.end <= event.start) invalid('positive ordered observation interval required');
}
function reason(value) { if (typeof value !== 'string' || !value.trim() || value.length > 2048) invalid('explicit gap reason required'); }
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

async function replay(root, sessionId, records) {
  const store = createResourceStore(root); const intervals = []; const gaps = []; const windows = []; const commands = [];
  let timebase; let nextCommandOrder = 1; let lastCommandTime = -1;
  for (const record of records) {
    if (record.type !== 'session-observation' || record.payload?.sessionId !== sessionId) invalid('record belongs to another session');
    const event = record.payload.event;
    if (event?.type === 'opened') {
      fields(event, ['type', 'version', 'timebase']); fields(event.timebase, ['unit', 'origin', 'fps']);
      if (timebase || record.seq !== 1 || event.version !== 1 || !['seconds', 'milliseconds', 'frames'].includes(event.timebase.unit)
        || !Number.isFinite(event.timebase.origin) || event.timebase.origin < 0
        || (event.timebase.unit === 'frames' && (!Number.isFinite(event.timebase.fps) || event.timebase.fps <= 0))) invalid('first record must define a supported session timebase');
      timebase = event.timebase; continue;
    }
    if (!timebase) invalid('session must be opened before observations');
    if (event?.type === 'command') {
      fields(event, ['type', 'order', 'at', 'revisionId']);
      if (!Number.isSafeInteger(event.order) || event.order !== nextCommandOrder || !Number.isFinite(event.at) || event.at < 0 || event.at < lastCommandTime) invalid('command order or timestamp differs; declare unobserved command gaps explicitly');
      const revision = await store.readRevision(event.revisionId);
      if (revision.storageStatus !== 'owned_snapshot') invalid('command payload bytes must be retained');
      commands.push(event); nextCommandOrder++; lastCommandTime = event.at;
    } else if (event?.type === 'command-gap') {
      fields(event, ['type', 'fromOrder', 'toOrder', 'reason']); reason(event.reason);
      if (event.fromOrder !== nextCommandOrder || !Number.isSafeInteger(event.toOrder) || event.toOrder >= Number.MAX_SAFE_INTEGER || event.toOrder < event.fromOrder) invalid('command gap must continue the observed command order');
      gaps.push(event); nextCommandOrder = event.toOrder + 1;
    } else if (['media', 'gap', 'observation-window'].includes(event?.type)) {
      interval(event);
      if (event.type === 'observation-window') { fields(event, ['type', 'start', 'end']); windows.push(event); continue; }
      assertResourceId(event.trackId);
      if (event.type === 'media') {
        fields(event, ['type', 'trackId', 'start', 'end', 'revisionId', 'contentHash']);
        const revision = await store.readRevision(event.revisionId);
        if (revision.storageStatus !== 'owned_snapshot' || revision.contentHash !== event.contentHash) invalid('retained media content hash differs');
        if ([...intervals, ...gaps].some((prior) => prior.trackId === event.trackId && overlaps(prior, event))) invalid('media interval overlaps an existing observation or explicit gap');
        intervals.push({ ...event, resourceId: revision.resourceId, byteLength: revision.byteLength, verification: 'content-verified' });
      } else {
        fields(event, ['type', 'trackId', 'start', 'end', 'reason']); reason(event.reason);
        if ([...intervals, ...gaps].some((prior) => prior.trackId === event.trackId && overlaps(prior, event))) invalid('gap contradicts a retained media interval or prior gap');
        gaps.push(event);
      }
    } else invalid('unsupported session event');
  }
  return { sessionId, sessionHead: headOf(records), timebase: timebase ?? null, commands, intervals, gaps,
    observationWindows: windows, nextCommandOrder, records, observation: 'host-reported', restorability: 'unknown' };
}

/** Local observation only: no live commands, media capture or provider network calls. */
export async function recordSessionObservation(root, input) {
  input = JSON.parse(canonicalJson(input)); fields(input, ['sessionId', 'expectedHead', 'event']);
  if (!Object.hasOwn(input, 'expectedHead')) invalid('exact expected session head required');
  return withWorkspaceStateTransaction(root, async () => {
    const ledger = ledgerFor(root, input.sessionId); const records = await ledger.readAll(); const head = headOf(records);
    if (head === null ? input.expectedHead !== null : !sameCheckpoint(head, input.expectedHead)) throw new FolioError('SESSION_HEAD_CONFLICT', 'session observations changed');
    const payload = { sessionId: input.sessionId, event: input.event };
    await replay(root, input.sessionId, [...records, { type: 'session-observation', payload, seq: (head?.seq ?? 0) + 1, hash: 'pending' }]);
    const record = await ledger.append({ type: 'session-observation', payload });
    return { sessionId: input.sessionId, sessionHead: { seq: record.seq, hash: record.hash }, observation: 'host-reported' };
  });
}
export async function readSessionRecords(root, input) {
  fields(input, ['sessionId', 'sessionHead']);
  return withWorkspaceStateTransaction(root, () => readPrefix(root, input));
}
async function readPrefix(root, input) {
  let records = await ledgerFor(root, input.sessionId).readAll();
  if (Object.hasOwn(input, 'sessionHead')) {
    const head = input.sessionHead;
    if (head === null) records = [];
    else if (!Number.isSafeInteger(head?.seq) || head.seq < 1 || records[head.seq - 1]?.hash !== head.hash) invalid('session prefix is not in verified history');
    else records = records.slice(0, head.seq);
  }
  return replay(root, input.sessionId, records);
}
/** Save this value as an owned JSON Resource of kind session-record to connect a verified prefix to the graph. */
export function sessionResourceValue(session) {
  return { version: 1, sessionId: session.sessionId, sessionHead: session.sessionHead, timebase: session.timebase,
    commands: session.commands, media: session.intervals.map(({ type, trackId, start, end, revisionId, contentHash }) => ({ type, trackId, start, end, revisionId, contentHash })),
    gaps: session.gaps, observationWindows: session.observationWindows, restorability: 'unknown' };
}
/** No lock nesting: callers query within their existing state transaction; ledger and every referenced file are reverified. */
export async function readSessionRelations(root, revision) {
  if (revision.kind !== 'session-record') return [];
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') invalid('owned session-record JSON required');
  const value = JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
  const session = await readPrefix(root, { sessionId: value.sessionId, sessionHead: value.sessionHead });
  if (canonicalJson(sessionResourceValue(session)) !== canonicalJson(value)) invalid('session Resource differs from the verified observation prefix');
  return [...session.commands.map((command) => ({ targetRevisionId: command.revisionId, kind: 'session-command' })),
    ...session.intervals.map((interval) => ({ targetRevisionId: interval.revisionId, kind: 'session-artifact' }))];
}
