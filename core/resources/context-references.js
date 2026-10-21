import { createResourceStore } from './revisions.js';
import { CONTEXT_KINDS, validateUsageContext, usageContextReferences, contextInvalid } from './context-records.js';
import { validateContextPackage } from '../context/package.js';
import { validateResourceUsage } from './usage-bindings.js';
import { verifyNodeBridge } from '../context/bridges.js';
import { verifyAlignmentBindings } from './alignment-bindings.js';
import { verifyNormalizationMap } from './normalization-bindings.js';
import { FolioError } from '../errors.js';
import { assertContextIsolation } from '../context/isolation.js';

export async function verifyContextValue(root, kind, value, { requireCurrentBridges = false } = {}) {
  let refs = [];
  async function checkBridge(nodeRef) {
    const bridge = await verifyNodeBridge(root, nodeRef);
    if (requireCurrentBridges && bridge.status !== 'verified') throw new FolioError('CONTEXT_BRIDGE_INVALID', 'new context must prove the exact current node/body/revision bridge');
  }
  if (kind === 'usage-context') {
    refs = usageContextReferences(validateUsageContext(value));
    for (const state of value.states) if (state.nodeRef) await checkBridge(state.nodeRef);
  }
  if (kind === 'context-package') refs = await validateContextPackage(root, value);
  if (kind === 'resource-usage') {
    refs = await validateResourceUsage(root, value);
    if (value.nodeRef) await checkBridge(value.nodeRef);
  }
  const store = createResourceStore(root);
  if (refs.length > 4096) contextInvalid('context references exceed the inspection limit');
  let isolation = value;
  if (kind === 'resource-usage') isolation = JSON.parse((await store.readContent(value.contextRevisionId)).toString('utf8'));
  await assertContextIsolation(root, refs, isolation);
  return refs;
}
export async function verifyContextResource(root, input) {
  if (!CONTEXT_KINDS.has(input.kind)) return;
  if (input.owned?.mediaType !== 'application/json') contextInvalid('context records require owned JSON');
  await verifyContextValue(root, input.kind, JSON.parse(Buffer.from(input.owned.bytes).toString('utf8')), { requireCurrentBridges: true });
}
/** Only actual provided inputs expand closure; package provenance and omissions do not. */
export async function readContextReferences(root, revision) {
  if (!CONTEXT_KINDS.has(revision.kind) && !['audio-alignment', 'normalization-map'].includes(revision.kind)) return [];
  if (revision.storageStatus !== 'owned_snapshot' || revision.mediaType !== 'application/json') contextInvalid('context records require owned JSON');
  const value = JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
  if (revision.kind === 'audio-alignment') return (await verifyAlignmentBindings(root, value)).revisionIds;
  if (revision.kind === 'normalization-map') return verifyNormalizationMap(root, value);
  return verifyContextValue(root, revision.kind, value);
}
export async function readResourceRelations(root, revision) {
  const refs = await readContextReferences(root, revision);
  const relations = refs.map((targetRevisionId) => ({ targetRevisionId, kind: revision.kind === 'context-package' ? 'context-input' : 'usage' }));
  if (revision.kind === 'context-package') {
    const value = JSON.parse((await createResourceStore(root).readContent(revision.revisionId)).toString('utf8'));
    if (value.sourceContextRevisionId) relations.push({ targetRevisionId: value.sourceContextRevisionId, kind: 'context-evidence' });
  }
  return relations;
}
