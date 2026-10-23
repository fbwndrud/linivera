import { canonicalJson } from '../util/hash.js';
import { createResourceStore } from '../resources/revisions.js';
import { readWorkspaceState } from '../publications/state.js';
import { readInputDefinitions, assertInputScope } from '../resources/input-definitions.js';
import { assertContextIsolation } from '../context/isolation.js';
import { exactFact } from '../readiness/records.js';
import { readReadinessSelections } from '../readiness/selection.js';
import { validateConnectionInput, validateCheckReferences, readAccessJson, invalidAccess, timestamp, connectionReferences } from './records.js';

const nextAction = { installation: 'Install the documented official tool or host route.', exposure: 'Expose the documented capability to this host.', authentication: 'Authenticate this route using host secret management.', permission: 'Verify the exact account/project capability permissions.', plan: 'Verify the required plan without purchasing automatically.', credits: 'Verify applicable credits and balance without generating paid output.' };
/** No provider calls: host attestations remain distinct from independent Linivera verification. */
export async function buildConnectionReadiness(root, input, state, evaluatedAt) {
  validateConnectionInput(input); timestamp(evaluatedAt);
  const check = await readAccessJson(root, input.checkRevisionId, 'connection-check');
  const { access, capability, request } = await validateCheckReferences(root, check.value);
  for (const key of ['accessSpecificationRevisionId', 'capabilitySpecificationRevisionId', 'requestRevisionId', 'scopeId', 'pathId', 'accountAlias', 'projectAlias']) if (input[key] !== check.value[key]) invalidAccess('check belongs to another exact request, account, project, route or scope');
  const { definitions } = await readInputDefinitions(root, input, state);
  const store = createResourceStore(root);
  for (const id of connectionReferences({ input })) assertInputScope(definitions, (await store.readRevision(id)).resourceId);
  await assertContextIsolation(root, [check.revision, request.revision], input);
  const checkedAt = timestamp(check.value.checkedAt); const now = timestamp(evaluatedAt);
  const expiresAt = Math.min(timestamp(check.value.expiresAt), checkedAt + access.value.maxCheckAgeSeconds * 1000);
  const temporalStatus = checkedAt > now ? 'unknown' : now >= expiresAt ? 'expired' : 'current';
  const required = access.value.requiredChecks;
  const checks = check.value.checks.map((row) => {
    const needsProbe = !['installation', 'exposure'].includes(row.kind);
    const insufficientEvidence = row.basis === 'user-declaration' || needsProbe && row.basis === 'host-tool-metadata'
      || required.includes(row.kind) && row.reasonCode === 'not-applicable';
    const effectiveStatus = temporalStatus !== 'current' ? temporalStatus : row.status === 'passed' && insufficientEvidence ? 'partial' : row.status;
    return { ...row, required: required.includes(row.kind), effectiveStatus,
      nextAction: !required.includes(row.kind) || effectiveStatus === 'passed' ? null : nextAction[row.kind] };
  });
  const scope = definitions.profile.value.scope.filter((id) => definitions.policy.value.scope.includes(id)).sort();
  const selected = await readReadinessSelections(root, input, state, scope);
  return { version: 1, input, workspaceCheckpoint: state.checkpoint, evaluatedAt, accessSpecification: exactFact(access.revision),
    capabilitySpecification: exactFact(capability.revision), request: exactFact(request.revision), check: exactFact(check.revision),
    definitions: Object.fromEntries(Object.entries(definitions).map(([kind, value]) => [kind, { revisionId: value.revisionId, contentHash: value.contentHash, definitionHash: value.definitionHash }])),
    search: { selected }, observation: 'host-reported', checks,
    freshness: { checkedAt: check.value.checkedAt, expiresAt: new Date(expiresAt).toISOString(), status: temporalStatus, meaning: 'Retained observation only; fresh operations recheck expiry and selected revisions.' },
    readiness: { canPrepare: temporalStatus === 'current' && checks.filter((row) => row.required).every((row) => row.effectiveStatus === 'passed') },
    decision: { internalExecutionAuthority: 'not-granted', credentialStorage: 'host-secret-store', providerAccountIndependentlyVerified: false,
      meaning: 'This report cannot replace policy grants, approvals, rights or the host check immediately before a provider call.' } };
}
export async function compareConnectionReadiness(root, input) {
  const copied = JSON.parse(canonicalJson(input));
  validateConnectionInput(copied);
  const check = await readAccessJson(root, copied.checkRevisionId, 'connection-check');
  await validateCheckReferences(root, check.value, { currentContract: true });
  return buildConnectionReadiness(root, copied, await readWorkspaceState(root), new Date().toISOString());
}
export async function retainConnectionReadiness(root, { resourceId, ...input }) {
  const report = await compareConnectionReadiness(root, input);
  return createResourceStore(root).propose({ resourceId, kind: 'connection-readiness', owned: { bytes: canonicalJson(report), mediaType: 'application/json' } });
}
export async function retainConnectionCheck(root, { resourceId, check }) {
  await validateCheckReferences(root, check, { currentContract: true });
  return createResourceStore(root).propose({ resourceId, kind: 'connection-check', owned: { bytes: canonicalJson(check), mediaType: 'application/json' } });
}
