import { FolioError } from '../errors.js';

const refuse = (code, message) => { throw new FolioError(code, message); };

/** 참조·DAG·관점 호환성은 모델의 의미 추측 없이 검사한다. */
export function validateGraph(snapshot) {
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const claims = new Set(snapshot.claims.map((c) => c.id));
  const visited = new Set(); const visiting = new Set();
  function visit(id) {
    if (!evidence.has(id)) refuse('LORE_REFERENCE_INVALID', id);
    if (visiting.has(id)) refuse('LORE_DEPENDENCY_CYCLE', id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of evidence.get(id).dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of evidence.keys()) visit(id);
  for (const row of [...snapshot.claims, ...snapshot.questions]) {
    for (const id of [...row.support, ...row.against]) if (!evidence.has(id)) refuse('LORE_REFERENCE_INVALID', id);
    if (row.support.some((id) => row.against.includes(id))) refuse('LORE_REFERENCE_INVALID', 'one record cannot both support and oppose the same claim');
  }
  for (const q of snapshot.questions) for (const id of q.claimIds) if (!claims.has(id)) refuse('LORE_REFERENCE_INVALID', id);
  return evidence;
}

export function qualifyingSupport(snapshot, validAnchors = null) {
  const evidence = validateGraph(snapshot);
  const memo = new Map();
  function qualifies(id, perspectiveId) {
    const key = `${id}:${perspectiveId ?? ''}`;
    if (memo.has(key)) return memo.get(key);
    const e = evidence.get(id);
    if (!e || e.perspectiveId !== perspectiveId || e.basis === 'inferred' || (validAnchors !== null && validAnchors.get(id) !== true)) return false;
    const result = e.basis === 'author' ? true : e.basis === 'derived'
      ? e.dependencies.every((d) => qualifies(d, perspectiveId)) : validAnchors === null || validAnchors.get(id) === true;
    memo.set(key, result);
    return result;
  }
  return (row) => row.support.some((id) => qualifies(id, row.perspectiveId));
}

export function assertAdoptions(snapshot) {
  const supported = qualifyingSupport(snapshot);
  for (const c of snapshot.claims) if (c.status === 'adopted' && !supported(c)) refuse('LORE_SUPPORT_REQUIRED', c.id);
  for (const q of snapshot.questions) {
    if (q.status === 'resolved' && q.resolution.basis === 'verified' && (!supported(q) || q.against.length > 0)) refuse('LORE_RESOLUTION_UNSUPPORTED', q.id);
  }
}
