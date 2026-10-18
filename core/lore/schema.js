import { FolioError } from '../errors.js';
import { assertId } from '../store/ids.js';
import { canonicalJson } from '../util/hash.js';

export const invalid = (message) => new FolioError('LORE_INPUT_INVALID', message);
export const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function keys(v, allowed) {
  if (!object(v) || Object.keys(v).some((k) => !allowed.includes(k))) throw invalid('unknown or malformed fields');
}
export function text(v, label, max = 4000) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\uD800-\uDFFF]/u.test(v)) throw invalid(`invalid ${label}`);
  return v;
}
export function id(v) { assertId(v, 'lore'); if (v.length > 100) throw invalid('ID too long'); return v; }
export function ids(v = []) {
  if (!Array.isArray(v) || v.length > 200 || new Set(v).size !== v.length) throw invalid('IDs must be a unique list');
  return v.map(id).sort();
}
function choice(v, options) { if (!options.includes(v)) throw invalid(`expected ${options.join('/')}`); return v; }
const perspective = (v) => v === undefined || v === null ? null : id(v);
function rows(v = [], parse) {
  if (!Array.isArray(v) || v.length > 200) throw invalid('too many records');
  const out = v.map(parse);
  if (new Set(out.map((r) => r.id)).size !== out.length) throw invalid('duplicate IDs');
  return out.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function evidence(e) {
  keys(e, ['id', 'basis', 'text', 'perspectiveId', 'anchor', 'dependencies', 'limitations']);
  const basis = choice(e.basis, ['author', 'explicit', 'attributed', 'inferred', 'derived']);
  const dependencies = ids(e.dependencies);
  if ((basis === 'derived') !== (dependencies.length > 0)) throw invalid('only derived evidence has non-empty dependencies');
  const p = perspective(e.perspectiveId);
  if (basis === 'attributed' && p === null) throw invalid('attributed evidence needs a perspective');
  const anchor = e.anchor ?? null;
  if (['explicit', 'attributed'].includes(basis) && !object(anchor)) throw invalid('text evidence needs an anchor');
  if (['author', 'derived'].includes(basis) && anchor !== null) throw invalid('author/derived evidence has no text anchor');
  if (anchor !== null) {
    keys(anchor, ['kind', 'id', 'rev', 'hash', 'quote', 'span', 'receiptId', 'before', 'after']);
    choice(anchor.kind, ['source', 'node']); id(anchor.id); text(anchor.quote, 'anchor quote', 500);
    if (!/^sha256:[a-f0-9]{64}$/.test(anchor.rev)) throw invalid('anchor needs an exact revision');
  }
  return { id: id(e.id), basis, text: text(e.text, 'evidence text'), perspectiveId: p, anchor: structuredClone(anchor), dependencies,
    limitations: basis === 'inferred' ? text(e.limitations, 'inference limitations') : (e.limitations === undefined || e.limitations === '' ? '' : text(e.limitations, 'limitations')) };
}
function claim(c) {
  keys(c, ['id', 'entityId', 'text', 'perspectiveId', 'status', 'support', 'against']);
  return { id: id(c.id), entityId: id(c.entityId), text: text(c.text, 'claim'), perspectiveId: perspective(c.perspectiveId),
    status: choice(c.status ?? 'proposed', ['proposed', 'adopted', 'rejected', 'superseded']), support: ids(c.support), against: ids(c.against) };
}
function question(q) {
  keys(q, ['id', 'text', 'perspectiveId', 'claimIds', 'support', 'against', 'required', 'nodeIds', 'status', 'resolution']);
  if (q.required !== undefined && typeof q.required !== 'boolean') throw invalid('required must be boolean');
  const status = choice(q.status ?? 'open', ['open', 'deferred', 'resolved']);
  let resolution = null;
  if (status === 'resolved') {
    keys(q.resolution, ['basis', 'reason']);
    resolution = { basis: choice(q.resolution.basis, ['verified', 'author_decision']), reason: text(q.resolution.reason, 'resolution reason') };
  } else if (q.resolution !== undefined && q.resolution !== null) throw invalid('only resolved questions have a resolution');
  return { id: id(q.id), text: text(q.text, 'question'), perspectiveId: perspective(q.perspectiveId), claimIds: ids(q.claimIds),
    support: ids(q.support), against: ids(q.against), required: q.required ?? false, nodeIds: ids(q.nodeIds), status, resolution };
}
export function normalizeSnapshot(input) {
  keys(input, ['evidence', 'claims', 'questions']);
  if (Buffer.byteLength(canonicalJson(input)) > 512000) throw invalid('snapshot is too large');
  return { evidence: rows(input.evidence, evidence), claims: rows(input.claims, claim), questions: rows(input.questions, question) };
}
