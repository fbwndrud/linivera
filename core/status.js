import { openWorkspace } from './run/workspace.js';
import { createRunStore, OPEN_STATES } from './run/run-store.js';
import { pickNext } from './run/next.js';
import { openLedger } from './ledger/ledger.js';
import { DECISIONS_LEDGER } from './ledger/decisions.js';
import { publishedEvents } from './ledger/event-visibility.js';
import { findStale } from './scope/stale.js';
import { flaggedNodes, pendingRechecks } from './scope/rechecks.js';
import { detectDrift } from './store/drift.js';
import { OCCURRENCES_LEDGER } from './occurrences/records.js';
import { occurrenceStates, staleOccurrences, liveMarks } from './occurrences/state.js';
import { evidenceStatus } from './evidence/status.js';
import { pendingFileTxStatus, TX_DIR } from './util/file-tx.js';
import { coverageFor } from './tracking/coverage.js';
import { isTrackingRef } from './tracking/stale.js';
import { assetsSummary } from './assets/view.js';
import { runTextDrift } from './run/text-guard.js';
import { blocksStatus } from './blocks/catalog.js';
import { linksStatus } from './links/graph.js';
import { variantsStatus } from './variants/status.js';
import { isVariantRun } from './variants/model.js';

/**
 * 지금 상태·다음 할 일·다시 확인 필요·손수정. 기록장이 깨졌으면 그것만 알린다.
 * 읽을 수 없는 실행 파일은 실행기처럼 건너뛰고 { code: 'RUN_FILE_CORRUPT', runId } 경고로 알린다.
 */
export async function workStatus(root, { packs }) {
  const receiptsLedger = openLedger(root, 'receipts');
  const eventsLedger = openLedger(root, 'events');
  const ledger = {
    receipts: await receiptsLedger.verify(), events: await eventsLedger.verify(), decisions: await openLedger(root, DECISIONS_LEDGER).verify(),
  };
  if (!ledger.receipts.ok || !ledger.events.ok || !ledger.decisions.ok) {
    return { ledger, next: null, activeRun: null, waiting: [], stale: [], recheck: [], flagged: [], drift: [], warnings: [] };
  }
  const trackingLedger = await openLedger(root, 'tracking').verify();
  const invalidTracking = (tracking) => ({ ledger: { ...ledger, tracking }, next: null, activeRun: null,
    waiting: [], stale: [], recheck: [], flagged: [], drift: [], warnings: [] });
  if (!trackingLedger.ok) return invalidTracking(trackingLedger);
  let workspace;
  try { workspace = await openWorkspace(root, { packs }); }
  catch (error) {
    if (['LOCK_TRACKING_INTEGRITY', 'TRACKING_RECORD_INVALID'].includes(error.code)) return invalidTracking({ ok: false, code: error.code, error: error.message });
    throw error;
  }
  const { work, applied } = workspace;
  const listed = await createRunStore(root).list();
  const runs = listed.filter((r) => !r.error);
  const warnings = [...work.warnings, ...listed.filter((r) => r.error).map((r) => ({ code: r.error, runId: r.runId }))];
  const tx = await pendingFileTxStatus(root);
  if (tx.pending) warnings.push({ code: 'TX_INTERRUPTED', dir: TX_DIR, valid: tx.valid });
  const receiptRecords = await receiptsLedger.readAll();
  const events = publishedEvents({ eventRecords: await eventsLedger.readAll(), receiptRecords, legacyMode: true });
  const open = runs.find((r) => OPEN_STATES.has(r.state));
  const next = pickNext(work, receiptRecords, runs);
  const occurrences = await occurrencesStatus(root, work);
  const stale = findStale({ work, receiptRecords, events, applied, marks: occurrences.marks });
  return {
    ledger,
    next: next ? { nodeId: next.id, level: next.level, kind: next.kind } : null,
    activeRun: open ? { runId: open.runId, nodeId: open.nodeId, state: open.state, ...(isVariantRun(open) ? { variant: open.variant } : {}) } : null,
    waiting: runs.filter((r) => r.state === 'waiting_children').map((r) => r.nodeId),
    stale,
    trackingStale: stale.map((entry) => ({ nodeId: entry.nodeId, reasons: entry.reasons.filter(isTrackingRef) })).filter((entry) => entry.reasons.length),
    backfillPending: coverageFor(work).filter((entry) => entry.state !== 'complete'),
    recheck: pendingRechecks(stale),
    flagged: flaggedNodes(work, receiptRecords),
    // recommit 힌트(M4): 기능이 켜져 있으면 HAND_EDITED · COMMITTED_WITHOUT_RECORD 는 recommit 실행으로 다시 커밋할 수 있다는 뜻이다.
    // 열린 실행의 노드 파일이 실행 도중 손으로 바뀌었으면 CHANGED_DURING_RUN(C0) — 그 실행은 NODE_TEXT_CHANGED(다시 커밋이면
    // RECOMMIT_TEXT_CHANGED)로 막혀 skip 만 받는다. 단, 영수증이 이미 기록장에 있는 커밋(committing + 영수증)은 잠금대로
    // 별도 immutable intent 검사가 바이트 충돌을 보고하므로 여기서 중복 안내하지 않는다.
    drift: [...detectDrift(work, receiptRecords).map((d) => (
      work.config.features.recommit && (d.code === 'HAND_EDITED' || d.code === 'COMMITTED_WITHOUT_RECORD') ? { ...d, recommit: true } : d
    )), ...runTextDrift(work, open, receiptRecords)],
    occurrences: occurrences.status,
    // 근거 연결(N2): 본문이 바뀌어 다시 찾지 못한 주장. 등장 위치와 같은 모양, evidence 기능이 꺼지면 null.
    evidence: await evidenceStatus(root, work),
    // 블록(N3): 겹친 앵커·깨진 참조·각주·자료 인용 문제와 블록 수. 파일에서 바로 계산한다. blocks 기능이 꺼지면 null.
    blocks: blocksStatus(work),
    // 노드 연결(N4): 없는 노드를 가리키거나(LINK_BROKEN) 자기 자신을 가리키는(LINK_SELF) 링크와 링크 수. links 기능이 꺼지면 null.
    links: linksStatus(work),
    // 판본(N6): 판본마다 커밋 수·다시 확인 필요(원본·용어 대응표·검사가 바뀜)·손수정·아직 없는 잎. 원본(main)의 stale·drift 와 섞지 않는다. 기능이 꺼지면 null.
    variants: variantsStatus({ work, receiptRecords, events, applied }),
    ...([...work.assets.values()].some((a) => a.managed) ? { assets: assetsSummary(work) } : {}),
    ...(work.lore ? { lore: work.lore } : {}),
    ...(work.interview ? { interview: work.interview } : {}),
    warnings,
  };
}

/** 등장 위치: 다시 찾지 못한 것(stale)과 전체 수. 기능이 꺼져 있으면 null. 기록장이 깨졌으면 { ledger, stale: [], total: 0 }. */
async function occurrencesStatus(root, work) {
  if (!work.config.features.occurrences) return { status: null, marks: null };
  const ledger = openLedger(root, OCCURRENCES_LEDGER);
  const verified = await ledger.verify();
  if (!verified.ok) return { status: { ledger: verified, stale: [], total: 0 }, marks: null };
  const states = occurrenceStates(work, await ledger.readAll());
  return { status: { stale: staleOccurrences(states), total: states.length }, marks: work.config.features.occurrenceScope ? liveMarks(states) : null };
}
