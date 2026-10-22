import { canonicalJson } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { recordObject, contextInvalid, contextText, revisionList, validateUsageContext, usageContextReferences } from '../resources/context-records.js';
import { historicalTrackingEvidence } from './bridges.js';
import { evaluateRequirements, coverRequirements, assertRequirementsMet } from './requirements.js';

export async function validateContextPackage(root, value) {
  recordObject(value, ['version', 'scopeId', 'purpose', 'pathId', 'timeLabel', 'sourceContextRevisionId', 'requirements', 'items', 'referenceRevisionIds', 'coverage']);
  if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 4096) contextInvalid('versioned bounded context package required');
  contextText(value.scopeId, 'scopeId'); contextText(value.purpose, 'purpose');
  const store = createResourceStore(root);
  let context;
  if (value.sourceContextRevisionId) {
    const source = await store.readRevision(value.sourceContextRevisionId);
    if (source.kind !== 'usage-context') contextInvalid('package provenance must name a usage context');
    context = validateUsageContext(JSON.parse((await store.readContent(source.revisionId)).toString('utf8')));
    if (context.scopeId !== value.scopeId || context.pathId !== value.pathId || context.timeLabel !== value.timeLabel) contextInvalid('package provenance belongs to another scope, path or time');
  }
  recordObject(value.coverage, ['missing', 'unknown', 'truncated']);
  for (const key of ['missing', 'unknown', 'truncated']) {
    if (!Array.isArray(value.coverage[key]) || value.coverage[key].length > 8192) contextInvalid('bounded omission coverage required');
    for (const entry of value.coverage[key]) { recordObject(entry, ['revisionId', 'role', 'reason']); contextText(entry.reason, 'coverage reason'); }
  }
  const refs = [];
  for (const item of value.items) {
    recordObject(item, ['role', 'status', 'revisionId', 'referenceRevisionIds', 'contentHash', 'mediaType', 'byteLength', 'text', 'textComplete', 'content',
      'contextStateIndex', 'value', 'nodeRef', 'subjectRef', 'tracking']);
    contextText(item.role, 'role');
    if (!['observed', 'selected', 'candidate'].includes(item.status)) contextInvalid('context item status required');
    const references = revisionList(item.referenceRevisionIds);
    if (item.contextStateIndex !== undefined) {
      const state = context?.states[item.contextStateIndex];
      if (!Number.isSafeInteger(item.contextStateIndex) || !state) contextInvalid('context state must name an exact original index');
      if (item.revisionId !== (state.artifactRevisionId ?? usageContextReferences({ states: [state] })[0])) contextInvalid('context primary artifact differs from the retained state');
      for (const key of ['role', 'status', 'value', 'nodeRef', 'subjectRef']) if (canonicalJson(state[key] ?? null) !== canonicalJson(item[key] ?? null)) contextInvalid('context item differs from exact retained state');
      if (canonicalJson(usageContextReferences({ states: [state] }).sort()) !== canonicalJson(references.slice().sort())) contextInvalid('context evidence differs from retained state');
      if (item.tracking !== undefined) {
        const actual = await historicalTrackingEvidence(root, state);
        if (!Array.isArray(item.tracking) || item.tracking.some((entry) => !actual.some((known) => canonicalJson(known) === canonicalJson(entry)))) contextInvalid('tracking evidence differs from the exact node bridge');
      }
    } else if (item.status !== 'candidate' || ['value', 'nodeRef', 'subjectRef', 'tracking'].some((key) => item[key] !== undefined)) contextInvalid('unbound recommendations must remain separate candidates');
    if (!references.includes(item.revisionId)) contextInvalid('item must include its exact original revision');
    const revision = await store.readRevision(item.revisionId);
    if (revision.contentHash !== item.contentHash || revision.mediaType !== item.mediaType || (revision.byteLength ?? null) !== item.byteLength) contextInvalid('context item does not match retained bytes');
    if (item.text !== undefined) {
      if (revision.mediaType !== 'text/plain' || typeof item.text !== 'string' || typeof item.textComplete !== 'boolean') contextInvalid('text excerpts require explicit completeness');
      const original = (await store.readContent(revision.revisionId)).toString('utf8');
      if (!original.startsWith(item.text) || item.textComplete !== (original === item.text)) contextInvalid('context excerpt differs from retained original');
      if (!item.textComplete && !value.coverage.truncated.some((entry) => entry.revisionId === item.revisionId)) contextInvalid('partial text requires explicit truncation coverage');
    } else if (item.content !== 'manifest-only') contextInvalid('media context must remain a manifest reference');
    refs.push(...references);
  }
  for (const [index, state] of (context?.states ?? []).entries()) {
    if (state.status === 'unknown') {
      if (!value.coverage.unknown.some((entry) => entry.role === state.role)) contextInvalid('unknown source state must remain explicit');
    } else if (!value.items.some((item) => item.contextStateIndex === index)) {
      const revisionId = state.artifactRevisionId ?? usageContextReferences({ states: [state] })[0];
      if (![...value.coverage.missing, ...value.coverage.truncated].some((entry) => entry.revisionId === revisionId && entry.role === state.role)) contextInvalid('excluded source state requires explicit omission coverage');
    }
  }
  // Requirements are copied exactly from the retained source; a package cannot relax or drop them.
  if (canonicalJson(value.requirements ?? null) !== canonicalJson(context?.requirements ?? null)) contextInvalid('package requirements must equal its source context');
  if (context?.requirements) assertRequirementsMet(coverRequirements(await evaluateRequirements(root, context), value.items, value.coverage).missing);
  const exact = [...new Set(refs)].sort();
  if (canonicalJson(revisionList(value.referenceRevisionIds).slice().sort()) !== canonicalJson(exact)) contextInvalid('package reference closure must match actual provided items');
  return exact;
}
