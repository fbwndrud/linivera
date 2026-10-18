import { FolioError } from '../errors.js';
import { canonicalJson, sha256 } from '../util/hash.js';
import { stringifyYaml } from '../util/yaml.js';
import { fencedRanges, maskRanges } from '../util/fences.js';
import { serializeDoc } from '../store/frontmatter.js';
import { TREE_DIR } from '../store/tree.js';
import { CONTEXT_CHARS } from '../occurrences/anchor.js';
import { occurrenceStates } from '../occurrences/state.js';
import { allSurfaces, surfaceFields, surfaceKey } from '../occurrences/surfaces.js';
import { josaWarning } from './josa.js';
import { shiftOccurrenceItems } from './occurrence-shift.js';

/** 이름 바꾸기가 고칠 수 있는 표면. 자료(source)는 원본 불변이라 고치지 않는다. */
const EDITABLE = new Set(['node', 'entity', 'asset']);
/** 제어·서식·줄·문단 구분 문자(줄바꿈·NUL·U+2028·U+0085·zero-width·bidi 포함)가 하나라도 있는가. 이름에는 하나도 못 들어간다(Ruling C2-4). */
const hasControlChar = (s) => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s);
const nfc = (s) => s.normalize('NFC');

/**
 * @typedef {{ kind: string, id: string, field: string }} SurfaceRef
 * @typedef {{ id: string, surface: SurfaceRef, start: number, before: string, after: string, source: 'occurrence'|'scan' }} Change
 * @typedef {{ surface: { kind: string, id: string }, field: string, count: number, reason: 'SOURCE_IMMUTABLE' }} Untouched
 * @typedef {{ path: string, beforeHash: string, text: string }} PlanFile
 * @typedef {{ surface: SurfaceRef, textHash: string, items: Array<{ entityId: string, kind: string, quote: string, before: string, after: string }> }} OccurrenceUpdate
 * @typedef {{ changeId: string, code: 'JOSA_MISMATCH', particle: string }} RenameWarning
 * @typedef {{ surface: SurfaceRef, entityId: string, quote: string }} StaleCarried
 * @typedef {{ entityId: string, oldName: string, newName: string, keepOldName: boolean, changes: Change[], candidates: Change[],
 *   untouched: Untouched[], files: PlanFile[], occurrenceUpdates: OccurrenceUpdate[], staleCarried: StaleCarried[],
 *   committed: string[], warnings: RenameWarning[], planDigest: string }} Plan
 */

/**
 * @param {import('../store/work.js').Work} work
 * @param {{ id: string, name: string, aliases: string[] }} entity
 * @param {unknown} newName
 */
function assertName(work, entity, newName) {
  if (typeof newName !== 'string' || newName === '' || newName.length > 200 || newName !== newName.trim()
    || hasControlChar(newName) || nfc(newName) === nfc(entity.name)) {
    throw new FolioError('RENAME_NAME_INVALID', String(newName).slice(0, 200));
  }
  const target = nfc(newName);
  for (const other of work.entities.values()) {
    if (other.id === entity.id) continue;
    const names = [other.name, ...other.aliases].filter((n) => typeof n === 'string');
    if (names.some((n) => nfc(n) === target)) {
      throw new FolioError('RENAME_NAME_TAKEN', `${newName} is used by ${other.id}`, { by: other.id });
    }
  }
}

/** @param {unknown} value @param {string} label */
function assertIdList(value, label) {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new FolioError('RENAME_OPTIONS_INVALID', `${label} must be a string array`, { [label]: value });
  }
}

/**
 * 글에서 옛 이름이 시작하는 위치들(코드 블록 밖, 겹치지 않게).
 * @param {string} text
 * @param {string} name
 * @returns {number[]}
 */
function hitsIn(text, name) {
  const masked = maskRanges(text, fencedRanges(text));
  const out = [];
  let at = masked.indexOf(name);
  while (at !== -1) { out.push(at); at = masked.indexOf(name, at + name.length); }
  return out;
}

/**
 * 다른 엔티티의 더 긴 이름·별칭 안에 파묻힌 옛 이름 히트의 시작 위치들(Ruling C2-3). 코드 블록은 masked
 * 글로 이미 가려져 있다고 가정한다(hitsIn과 같은 masked 글을 받는다).
 * @param {string} masked
 * @param {string} oldName
 * @param {string[]} longerNames
 * @returns {Set<number>}
 */
function buriedStarts(masked, oldName, longerNames) {
  const buried = new Set();
  for (const longer of longerNames) {
    if (longer.length <= oldName.length || !longer.includes(oldName)) continue;
    let at = masked.indexOf(longer);
    while (at !== -1) {
      const end = at + longer.length;
      let hit = masked.indexOf(oldName, at);
      while (hit !== -1 && hit + oldName.length <= end) { buried.add(hit); hit = masked.indexOf(oldName, hit + 1); }
      at = masked.indexOf(longer, at + 1);
    }
  }
  return buried;
}

/** 뒤에서부터 바꿔서 앞 위치가 흔들리지 않게 한다. */
const replaceAt = (text, starts, from, to) => [...starts].sort((a, b) => b - a)
  .reduce((out, start) => out.slice(0, start) + to + out.slice(start + from.length), text);

/**
 * JSON Pointer 로 가리킨 문자열 하나만 바꾼 사본.
 * @param {any} value
 * @param {string} pointer
 * @param {string} text
 */
function setPointer(value, pointer, text) {
  const copy = structuredClone(value);
  const keys = pointer.split('/').slice(1).map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
  let at = copy;
  for (const key of keys.slice(0, -1)) at = at[key];
  at[keys.at(-1)] = text;
  return copy;
}

/** frontmatter 는 그대로 두고 본문만 바꾼 파일 글. 본문은 파일 끝 바이트 그대로라(parseDoc) 앞부분이 frontmatter 다. */
const withBody = (fileText, body, newBody) => fileText.slice(0, fileText.length - body.length) + newBody;

/**
 * 대상 엔티티의 새 별칭 목록. 문자열이 아닌 별칭(잘못된 데이터라도)은 손대지 않는다(Ruling C2-5 — 조용히
 * 지우지 않는다). keepOldName 이면 옛 이름을 별칭에 남기고, 아니면 새·옛 이름 둘 다 별칭에서 뺀다.
 * @param {unknown[]} rawAliases
 * @param {string} oldName
 * @param {string} newName
 * @param {boolean} keepOldName
 */
function nextAliases(rawAliases, oldName, newName, keepOldName) {
  const list = Array.isArray(rawAliases) ? rawAliases : [];
  const isName = (a, name) => typeof a === 'string' && a === name;
  if (!keepOldName) return list.filter((a) => !isName(a, newName) && !isName(a, oldName));
  const withoutNew = list.filter((a) => !isName(a, newName));
  return withoutNew.some((a) => isName(a, oldName)) ? withoutNew : [...withoutNew, oldName];
}

/**
 * 이름 바꾸기 계획(설계 §15). 파일은 읽기만 한다 — 쓰기는 applyRename 이 같은 인자로 계획을 다시 만들어 digest 를 대조한 뒤 한다.
 * 바꿀 곳: 기록된 등장 위치(stale 아님) 인용문 안의 옛 이름(기본 포함) + scan 으로 찾은 옛 이름(include 로 고르고 exclude 로 뺌).
 * 다른 엔티티의 더 긴 이름·별칭 안에 파묻힌 히트는 아예 보이지 않는다(Ruling C2-3). 자료는 바꾸지 않는다 —
 * untouched 로 알린다. 코드 블록 안은 보지 않는다.
 * @param {import('../store/work.js').Work} work
 * @param {unknown[]} occurrenceRecords
 * @param {{ entityId: string, newName: string, keepOldName?: boolean, include?: string[], exclude?: string[] }} options
 * @returns {Plan}
 */
export function planRename(work, occurrenceRecords, { entityId, newName, keepOldName = true, include = [], exclude = [] }) {
  const entity = work.entities.get(entityId);
  if (!entity) throw new FolioError('ENTITY_NOT_FOUND', String(entityId).slice(0, 200));
  if (entity.managed) throw new FolioError('RENAME_MANAGED_ENTITY', 'managed definitions require a tracking plan decision', { entityId });
  assertIdList(include, 'include');
  assertIdList(exclude, 'exclude');
  assertName(work, entity, newName);
  const oldName = entity.name;
  const allStates = occurrenceStates(work, occurrenceRecords);
  const liveStates = allStates.filter((s) => s.status !== 'stale');
  const longerNames = [...work.entities.values()].filter((e) => e.id !== entityId).flatMap((e) => [e.name, ...e.aliases]);

  /** @type {Change[]} */
  const all = [];
  /** @type {Untouched[]} */
  const untouched = [];
  for (const { kind, id, field, text } of allSurfaces(work)) {
    const masked = maskRanges(text, fencedRanges(text));
    const buried = buriedStarts(masked, oldName, longerNames);
    const hits = hitsIn(text, oldName).filter((start) => !buried.has(start));
    if (!hits.length) continue;
    if (!EDITABLE.has(kind)) { untouched.push({ surface: { kind, id }, field, count: hits.length, reason: 'SOURCE_IMMUTABLE' }); continue; }
    const key = surfaceKey({ kind, id, field });
    const marks = liveStates.filter((s) => s.entityId === entityId && surfaceKey(s.surface) === key);
    for (const start of hits) {
      const inMark = marks.some((m) => m.start <= start && start + oldName.length <= m.start + m.quote.length);
      all.push({
        id: `${key}@${start}`, surface: { kind, id, field }, start,
        before: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
        after: text.slice(start + oldName.length, start + oldName.length + CONTEXT_CHARS),
        source: inMark ? 'occurrence' : 'scan',
      });
    }
  }
  const allIds = new Set(all.map((c) => c.id));
  const includeIds = [...new Set(include)];
  const excludeIds = [...new Set(exclude)];
  const unknown = [...includeIds, ...excludeIds].filter((id) => !allIds.has(id));
  if (unknown.length) throw new FolioError('RENAME_INCLUDE_UNKNOWN', [...new Set(unknown)].join(', ').slice(0, 200), { unknown: [...new Set(unknown)].slice(0, 50) });
  const chosen = new Set([...all.filter((c) => c.source === 'occurrence').map((c) => c.id), ...includeIds]);
  for (const id of excludeIds) chosen.delete(id);
  const changes = all.filter((c) => chosen.has(c.id));
  const candidates = all.filter((c) => !chosen.has(c.id));
  const warnings = changes.map((c) => ({ changeId: c.id, code: /** @type {const} */ ('JOSA_MISMATCH'), particle: josaWarning(oldName, newName, c.after) }))
    .filter((w) => w.particle);

  // 표면마다 새 글
  const startsBySurface = new Map();
  for (const change of changes) {
    const key = surfaceKey(change.surface);
    if (!startsBySurface.has(key)) startsBySurface.set(key, { surface: change.surface, starts: [] });
    startsBySurface.get(key).starts.push(change.start);
  }
  const newTexts = new Map();
  for (const [key, { surface, starts }] of startsBySurface) {
    newTexts.set(key, replaceAt(surfaceFields(work, surface.kind, surface.id).get(surface.field), starts, oldName, newName));
  }

  // 파일: 노드·다른 엔티티는 본문만, 그림은 brief 글 leaf 만, 대상 엔티티는 이름·별칭 + 본문
  /** @type {PlanFile[]} */
  const files = [];
  const committed = [];
  const assetBriefs = new Map();
  for (const [key, { surface }] of startsBySurface) {
    const text = newTexts.get(key);
    if (surface.kind === 'node') {
      const node = work.tree.nodes.get(surface.id);
      files.push({ path: `${TREE_DIR}/${node.path}`, beforeHash: sha256(node.fileText), text: withBody(node.fileText, node.body, text) });
      if (node.status === 'committed') committed.push(node.id);
    } else if (surface.kind === 'entity' && surface.id !== entityId) {
      const other = work.entities.get(surface.id);
      if (other.managed) throw new FolioError('RENAME_MANAGED_ENTITY', 'managed definitions cannot be edited by file rename; exclude this surface', { entityId: other.id });
      files.push({ path: other.path, beforeHash: other.rev, text: withBody(other.fileText, other.body, text) });
    } else if (surface.kind === 'asset') {
      const asset = work.assets.get(surface.id);
      if (asset.managed) throw new FolioError('RENAME_MANAGED_ASSET', 'managed briefs require folio_assets update; exclude them from this rename plan', { assetId: asset.id });
      if (asset.managed) throw new FolioError('RENAME_MANAGED_ASSET', 'managed briefs require folio_assets update; exclude them from this rename plan', { assetId: asset.id });
      const brief = assetBriefs.get(asset.id) ?? asset.brief;
      assetBriefs.set(asset.id, setPointer(brief, surface.field.replace(/^\/brief/, ''), text));
    }
  }
  for (const [assetId, brief] of assetBriefs) {
    const asset = work.assets.get(assetId);
    files.push({ path: asset.path, beforeHash: sha256(asset.metaText), text: stringifyYaml({ ...asset.meta, brief }) });
  }
  const aliases = nextAliases(entity.data.aliases, oldName, newName, keepOldName);
  const data = { ...entity.data, name: newName };
  if (aliases.length) data.aliases = aliases; else delete data.aliases;
  const ownBody = newTexts.get(surfaceKey({ kind: 'entity', id: entityId, field: '' })) ?? entity.body;
  files.push({ path: entity.path, beforeHash: entity.rev, text: serializeDoc({ data, body: ownBody }) });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const { occurrenceUpdates, staleCarried } = shiftAllOccurrences({ allStates, startsBySurface, newTexts, oldName, newName });
  const planDigest = sha256(canonicalJson({
    entityId, newName, keepOldName, include: includeIds.sort(), exclude: excludeIds.sort(),
    files: files.map((f) => ({ path: f.path, beforeHash: f.beforeHash, afterHash: sha256(f.text) })), occurrenceUpdates,
  }));
  return { entityId, oldName, newName, keepOldName, changes, candidates, untouched, files, occurrenceUpdates, staleCarried, committed: committed.sort(), warnings, planDigest };
}

/**
 * 바뀌는 모든 표면의 등장 위치 새 기록(엔티티 가리지 않고 그 표면의 전부). shiftOccurrenceItems 로 옮기고
 * (Ruling C2-1), 옮길 수 없던 것·원래 stale이던 것은 staleCarried 로도 알린다(Ruling C2-2).
 * @param {{ allStates: any[], startsBySurface: Map<string, { surface: SurfaceRef, starts: number[] }>,
 *   newTexts: Map<string, string>, oldName: string, newName: string }} args
 * @returns {{ occurrenceUpdates: OccurrenceUpdate[], staleCarried: StaleCarried[] }}
 */
function shiftAllOccurrences({ allStates, startsBySurface, newTexts, oldName, newName }) {
  /** @type {OccurrenceUpdate[]} */
  const occurrenceUpdates = [];
  /** @type {StaleCarried[]} */
  const staleCarried = [];
  for (const [key, { surface, starts }] of startsBySurface) {
    const newText = newTexts.get(key);
    const onSurface = allStates.filter((s) => surfaceKey(s.surface) === key);
    if (!onSurface.length) continue;
    const { items, carried } = shiftOccurrenceItems({
      items: onSurface.map((s) => ({ entityId: s.entityId, kind: s.kind, quote: s.quote, before: s.before, after: s.after, status: s.status, start: s.start })),
      starts, oldName, newName, newText,
    });
    occurrenceUpdates.push({ surface, textHash: sha256(newText), items });
    for (const c of carried) staleCarried.push({ surface, entityId: c.entityId, quote: c.quote });
  }
  return { occurrenceUpdates, staleCarried };
}
