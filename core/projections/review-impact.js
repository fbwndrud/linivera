/** Propagate changed-source reasons through exact revisions; retain historical bytes and receipts. */
export function applyReviewImpact(entries, intermediates = []) {
  const outputs = [...entries.filter((e) => e.role === 'output'), ...intermediates];
  const causes = new Map(); const dependents = new Map(); const queue = [];
  const causeKey = (r) => JSON.stringify([r.resourceId, r.inputRevisionId, r.currentRevisionId, r.scopeId ?? null, r.bindingKey ?? null]);
  for (const e of outputs) {
    if (!causes.has(e.revisionId)) causes.set(e.revisionId, new Map());
    for (const ref of e.inputRefs) {
      if (!dependents.has(ref.revisionId)) dependents.set(ref.revisionId, new Set());
      dependents.get(ref.revisionId).add(e.revisionId);
    }
    for (const reason of e.reviewReasons) {
      const key = causeKey(reason); const map = causes.get(e.revisionId);
      if (!map.has(key)) { map.set(key, { ...reason, path: [reason.inputRevisionId, e.revisionId] }); queue.push([e.revisionId, key]); }
    }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const [revisionId, key] = queue[i]; const cause = causes.get(revisionId).get(key);
    for (const child of dependents.get(revisionId) ?? []) {
      const map = causes.get(child);
      if (map.has(key)) continue; // Finite even if a caller declared a cyclic relation.
      map.set(key, { ...cause, reason: 'upstream-review-required', path: [...cause.path, child] });
      queue.push([child, key]);
    }
  }
  return entries.map((e) => {
    if (e.role !== 'output') return e;
    const direct = new Set(e.reviewReasons.map(causeKey));
    const inherited = [...causes.get(e.revisionId).entries()].filter(([key]) => !direct.has(key)).map(([, value]) => value);
    const reviewReasons = [...e.reviewReasons, ...inherited];
    return { ...e, reviewRequired: reviewReasons.length > 0, reviewReasons };
  });
}
