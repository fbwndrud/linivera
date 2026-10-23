import { FolioError } from '../errors.js';
import { createResourceStore } from '../resources/revisions.js';
import { recordObject, revisionList, contextText, usageContextReferences } from '../resources/context-records.js';
import { contextBudget, truncateUtf8, packageBytes } from './budgets.js';
import { trackingBridge } from './bridges.js';
import { contextSource } from './source.js';
import { canonicalJson } from '../util/hash.js';
import { readContextReferences } from '../resources/context-references.js';
import { assertContextIsolation } from './isolation.js';
import { evaluateRequirements, coverRequirements } from './requirements.js';

/** Read-only preview. Persisting, selecting and approving are separate public actions. */
export async function collectContext(root, input) {
  recordObject(input, ['scopeId', 'purpose', 'budget', 'contextRevisionId', 'pathId', 'timeLabel', 'revisionIds']);
  contextText(input.scopeId, 'scopeId'); contextText(input.purpose, 'purpose');
  const budget = contextBudget(input.budget);
  const store = createResourceStore(root);
  const coverage = { missing: [], unknown: [], truncated: [] };
  const source = await contextSource(root, input, coverage);
  const context = source?.value ?? { states: [] };
  const states = context.states.map((state, contextStateIndex) => ({ ...state, contextStateIndex }));
  for (const revisionId of revisionList(input.revisionIds ?? [])) states.push({ role: 'explicit-reference', status: 'candidate', artifactRevisionId: revisionId, evidenceRevisionIds: [] });
  const items = []; let textBytes = 0;
  for (const state of states) {
    if (state.status === 'unknown') { coverage.unknown.push({ role: state.role, reason: state.unknown }); continue; }
    const refs = usageContextReferences({ states: [state] });
    const revisionId = state.artifactRevisionId ?? refs[0];
    if (items.length >= budget.maxItems) { coverage.truncated.push({ revisionId, role: state.role, reason: 'item budget' }); continue; }
    const stateBytes = Buffer.byteLength(state.value ?? '') + Buffer.byteLength(state.nodeRef?.quote ?? '');
    if (stateBytes > budget.maxTextBytes - textBytes) { coverage.truncated.push({ revisionId, role: state.role, reason: 'state text byte budget' }); continue; }
    textBytes += stateBytes;
    const bridge = await trackingBridge(root, state); coverage.unknown.push(...bridge.unknown);
    if (bridge.observations.length) {
      const trackingBytes = Buffer.byteLength(canonicalJson(bridge.observations));
      if (trackingBytes > budget.maxTextBytes - textBytes) {
        bridge.observations = []; coverage.truncated.push({ revisionId, role: state.role, reason: 'tracking text byte budget' });
      } else textBytes += trackingBytes;
    }
    let revision;
    try {
      revision = await store.readRevision(revisionId);
      const evidence = [];
      for (const ref of refs) evidence.push(ref === revisionId ? revision : await store.readRevision(ref));
      await readContextReferences(root, revision);
      await assertContextIsolation(root, evidence, { scopeId: input.scopeId, pathId: input.pathId ?? context.pathId, timeLabel: input.timeLabel ?? context.timeLabel });
    }
    catch (error) {
      if (error.code !== 'RESOURCE_OBJECT_MISSING') throw error;
      coverage.missing.push({ revisionId, role: state.role, reason: 'resource revision is unavailable' }); continue;
    }
    if (revision.storageStatus === 'external_unobserved') coverage.unknown.push({ revisionId, role: state.role, reason: 'external content has not been observed' });
    if (['audio-alignment', 'resource-usage'].includes(revision.kind)) {
      const timing = JSON.parse((await store.readContent(revisionId)).toString('utf8'));
      if ((timing.normalizedTextRevisionId || timing.normalized) && !timing.normalizationMapRevisionId) coverage.unknown.push({ revisionId, role: state.role, reason: 'normalized-to-original character mapping has not been observed' });
    }
    let text;
    if (revision.mediaType === 'text/plain' && revision.byteLength <= 8 * 1024 * 1024) {
      const original = (await store.readContent(revisionId)).toString('utf8');
      text = truncateUtf8(original, budget.maxTextBytes - textBytes);
      textBytes += Buffer.byteLength(text);
      if (text !== original) coverage.truncated.push({ revisionId, role: state.role, reason: 'text byte budget' });
    } else if (revision.mediaType === 'text/plain' && revision.storageStatus === 'owned_snapshot') coverage.truncated.push({ revisionId, role: state.role, reason: 'large text is represented by manifest only' });
    items.push({ role: state.role, status: state.status, revisionId, referenceRevisionIds: refs,
      ...(state.contextStateIndex !== undefined ? { contextStateIndex: state.contextStateIndex } : {}),
      ...(state.value !== undefined ? { value: state.value } : {}), ...(state.nodeRef ? { nodeRef: state.nodeRef } : {}),
      ...(state.subjectRef ? { subjectRef: state.subjectRef, tracking: bridge.observations } : {}),
      contentHash: revision.contentHash, mediaType: revision.mediaType, byteLength: revision.byteLength ?? null,
      ...(text !== undefined ? { text, textComplete: Buffer.byteLength(text) === revision.byteLength } : { content: 'manifest-only' }) });
  }
  const value = { version: 1, scopeId: input.scopeId, purpose: input.purpose,
    ...(source ? { sourceContextRevisionId: source.revision.revisionId } : {}),
    ...(context.pathId ? { pathId: context.pathId } : {}), ...(context.timeLabel ? { timeLabel: context.timeLabel } : {}),
    ...(context.requirements ? { requirements: context.requirements } : {}), items, referenceRevisionIds: [], coverage };
  const refreshRefs = () => { value.referenceRevisionIds = [...new Set(items.flatMap((item) => item.referenceRevisionIds))].sort(); };
  refreshRefs();
  while (packageBytes(value) > budget.maxManifestBytes && items.length) {
    const removed = items.pop();
    coverage.truncated.push({ revisionId: removed.revisionId, role: removed.role, reason: 'manifest byte budget' }); refreshRefs();
  }
  if (packageBytes(value) > budget.maxManifestBytes) throw new FolioError('CONTEXT_BUDGET_TOO_SMALL', 'manifest budget cannot hold explicit omission coverage');
  // Report declared roles; readiness never selects, approves or adds reverse relations.
  const { requirements, ready } = coverRequirements(await evaluateRequirements(root, context), items, coverage);
  return { scopeId: input.scopeId, purpose: input.purpose, package: value, coverage, requirements, ready };
}
