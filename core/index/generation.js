import { randomUUID } from 'node:crypto';
import { FolioError } from '../errors.js';
import { mkdir, rm, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { assetRefsInBody } from '../store/assets.js';
import { openLedger } from '../ledger/ledger.js';
import { publishedEvents } from '../ledger/event-visibility.js';
import { sha256, canonicalJson } from '../util/hash.js';
import { OCCURRENCES_LEDGER } from '../occurrences/records.js';
import { occurrenceStates } from '../occurrences/state.js';
import { scanReferences } from './scan.js';
import { SCHEMA_SQL, TABLES } from './schema.js';

export const indexPath = (root) => join(root, '.folio', 'index.db');

function insertOccurrences(insert, text, entities, surfaceKind, surfaceId, skipId = null) {
  const scan = scanReferences(text, entities.values());
  for (const [entityId, count] of scan.counts) {
    if (entityId !== skipId) insert.run(entityId, surfaceKind, surfaceId, 'scan', count);
  }
  const ambiguous = new Map();
  for (const m of scan.ambiguities) for (const id of m.entityIds) ambiguous.set(id, (ambiguous.get(id) ?? 0) + 1);
  for (const [id, count] of ambiguous) if (id !== skipId) insert.run(id, surfaceKind, surfaceId, 'ambiguous', count);
}

/** 작품 폴더와 기록장에서 index.db 를 처음부터 만든다. */
async function readInputs(root) {
  const work = await openWork(root);
  const receiptRecords = await openLedger(root, 'receipts').readAll();
  const eventRecords = await openLedger(root, 'events').readAll();
  const occurrenceRecords = work.config.features.occurrences ? await openLedger(root, OCCURRENCES_LEDGER).readAll() : [];
  return { work, receiptRecords, eventRecords, occurrenceRecords };
}

function serializable(value) {
  if (value instanceof Map) return [...value].map(([key, item]) => [key, serializable(item)]);
  if (value instanceof Set) return [...value].map(serializable);
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]));
  return value;
}
const digest = (inputs) => sha256(canonicalJson(serializable(inputs)));

/** 별도 DB를 완성·검증·닫는다. 호출자는 build부터 publish까지 작품 잠금을 유지한다. */
export async function buildIndexGeneration(root, { hooks = {} } = {}) {
  const inputs = await readInputs(root);
  const inputDigest = digest(inputs);
  const { work, receiptRecords, eventRecords, occurrenceRecords } = inputs;
  const path = join(root, '.folio', `index-candidate-${randomUUID()}.db`);
  await mkdir(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(SCHEMA_SQL);
    db.exec('BEGIN');
    const st = (sql) => db.prepare(sql);
    const nodeRow = st('INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const linkRow = st('INSERT INTO links VALUES (?,?,?,?,?)');
    const nodeAsset = st('INSERT INTO node_assets VALUES (?,?,?)');
    const occurrence = st('INSERT INTO occurrences VALUES (?,?,?,?,?)');
    for (const id of preorder(work.tree)) {
      const node = work.tree.nodes.get(id);
      const pos = work.positions.get(id);
      nodeRow.run(id, node.path, node.kind, node.level, node.role, node.status, node.parentId, node.siblingIndex,
        pos.ordinal, pos.key, pos.orderMode, pos.ordered ? 1 : 0, sha256(node.body));
      for (const link of node.links) linkRow.run(id, link.to, link.kind, link.label, work.tree.nodes.has(link.to) ? 1 : 0);
      for (const assetId of node.assets) nodeAsset.run(id, assetId, 'attached');
      for (const assetId of assetRefsInBody(node.body)) nodeAsset.run(id, assetId, 'inline');
      for (const entityId of node.entities) occurrence.run(entityId, 'node', id, 'declared', 1);
      insertOccurrences(occurrence, node.body, work.entities, 'node', id);
    }
    const entityRow = st('INSERT INTO entities VALUES (?,?,?,?,?,?)');
    const aliasRow = st('INSERT INTO aliases VALUES (?,?)');
    for (const entity of work.entities.values()) {
      entityRow.run(entity.id, entity.kind, entity.name, entity.path, entity.rev, entity.storage);
      for (const alias of entity.aliases) aliasRow.run(entity.id, alias);
      insertOccurrences(occurrence, entity.body, work.entities, 'entity', entity.id, entity.id);
    }
    const blockRow = st('INSERT INTO blocks VALUES (?,?,?,?)');
    for (const [id, anchor] of work.blocks.anchors) blockRow.run(id, anchor.nodeId, 'main', anchor.line);
    const refRow = st('INSERT INTO block_refs VALUES (?,?,?,?)');
    for (const ref of work.blocks.refs) refRow.run(ref.nodeId, ref.target, ref.line, ref.valid ? 1 : 0);
    const assetRow = st('INSERT INTO assets VALUES (?,?,?,?)');
    for (const asset of work.assets.values()) {
      assetRow.run(asset.id, asset.path, asset.rev, asset.managed ? 'managed' : 'file');
      for (const entityId of asset.entities) occurrence.run(entityId, 'asset', asset.id, 'declared', 1);
      insertOccurrences(occurrence, canonicalJson(asset.brief), work.entities, 'asset', asset.id);
    }
    const sourceRow = st('INSERT INTO sources VALUES (?,?,?,?)');
    for (const source of work.sources.values()) {
      sourceRow.run(source.id, source.path, source.rev, source.reliability === null ? null : String(source.reliability));
      insertOccurrences(occurrence, [source.title, ...source.spans.map((s) => s.quote ?? '')].join('\n'), work.entities, 'source', source.id);
    }
    const active = new Set(publishedEvents({ eventRecords, receiptRecords, legacyMode: true }).map((e) => e.eventId));
    const eventRow = st('INSERT INTO events VALUES (?,?,?,?,?,?,?)');
    for (const e of eventRecords.filter((r) => r.type === 'event')) {
      eventRow.run(e.eventId, e.seq, e.nodeId, e.entityId, e.kind, canonicalJson(e.data ?? null), active.has(e.eventId) ? 1 : 0);
    }
    const receiptRow = st('INSERT INTO receipts VALUES (?,?,?,?,?)');
    const receiptRef = st('INSERT INTO receipt_refs VALUES (?,?,?,?)');
    const commitRow = st('INSERT INTO commits VALUES (?,?,?,?,?)');
    for (const r of receiptRecords) {
      if (r.type === 'receipt') {
        receiptRow.run(r.receiptId, r.nodeId, r.variant ?? 'main', r.draftHash, r.seq);
        for (const ref of r.refs ?? []) receiptRef.run(r.receiptId, ref.kind, ref.id, ref.rev ?? null);
      } else if (r.type === 'commit') {
        commitRow.run(r.nodeId, r.variant ?? 'main', r.receiptId, r.committedHash, r.seq);
      }
    }
    const markRow = st('INSERT INTO marks VALUES (?,?,?,?,?,?,?,?,?)');
    for (const m of occurrenceStates(work, occurrenceRecords)) {
      markRow.run(m.entityId, m.surface.kind, m.surface.id, m.surface.field, m.kind, m.quote, m.start, m.status, m.origin);
    }
    db.exec('COMMIT');
    const counts = Object.fromEntries(TABLES.map((t) => [t, Number(db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n)]));
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new FolioError('INDEX_INVALID', path);
    return { path, counts, inputDigest, hooks };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* no open transaction */ }
    db.close();
    await rm(path, { force: true });
    throw error;
  } finally {
    if (db.isOpen) db.close();
  }
}

/** 입력을 다시 확인한 뒤 닫힌 DB를 교체한다. 실패 시 이전 DB는 그대로 둔다. */
export async function publishIndexGeneration(root, candidate) {
  try {
    await candidate.hooks.beforePublish?.();
    if (digest(await readInputs(root)) !== candidate.inputDigest) throw new FolioError('INDEX_INPUT_CHANGED', 'index inputs changed during build');
    await candidate.hooks.beforeReplace?.();
    await rename(candidate.path, indexPath(root));
    return { path: indexPath(root), counts: candidate.counts };
  } finally {
    await rm(candidate.path, { force: true });
  }
}
