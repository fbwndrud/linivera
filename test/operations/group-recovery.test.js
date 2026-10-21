import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { productionFixture } from './production-fixture.js';
import { observeGroups } from './group-fixture.js';
import { recordGroupReview, decideGroupPublication } from '../../core/operations/group-publications.js';
import { readWorkspaceState } from '../../core/publications/state.js';
import { issueGrant, revokeGrant } from '../../core/policy/grants.js';
async function killAt(root, decision, phase) {
  const moduleUrl = new URL('../../core/operations/group-publications.js', import.meta.url).href;
  const program = `import {decideGroupPublication} from ${JSON.stringify(moduleUrl)}; await decideGroupPublication(${JSON.stringify(root)},${JSON.stringify(decision)},{${phase}:()=>process.kill(process.pid,'SIGKILL')});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', program]);
  let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (_code, signal) => { try { assert.equal(signal, 'SIGKILL', stderr); resolve(); } catch (error) { reject(error); } }); });
}
test('a group decision interrupted before its marker rechecks grants; an already published decision replays', async (t) => {
  for (const phase of ['beforeMarker', 'afterMarker']) {
    const f = await productionFixture(t); const run = await observeGroups(f); const group = await run.submit('B');
    const receiptId = await recordGroupReview(f.root, { operationId: group.operationId, groupId: 'B', outputHashes: group.outputs.map((output) => output.contentHash), reviewer: 'host', findings: [] });
    const grant = await issueGrant(f.root, { grantId: 'grant', policyRevisionId: f.ids.policy, profileRevisionId: f.ids.profile, pipelineRevisionId: f.ids.pipeline, actor: 'host', actions: ['publish'], resourceIds: ['source', 'request'], expiresAt: Date.now() + 60000, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, authority: { actor: 'user', attested: true } });
    const decision = { operationId: group.operationId, groupId: 'B', receiptId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, actor: 'host', grantId: grant.grantId, action: 'approve' };
    await killAt(f.root, decision, phase);
    assert.equal((await readWorkspaceState(f.root)).groupPublications.length, phase === 'afterMarker' ? 1 : 0);
    await revokeGrant(f.root, { grantId: grant.grantId, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint, authority: { actor: 'user', attested: true } });
    if (phase === 'afterMarker') assert.equal((await decideGroupPublication(f.root, decision)).groupHash, group.groupHash);
    else await assert.rejects(decideGroupPublication(f.root, { ...decision, expectedCheckpoint: (await readWorkspaceState(f.root)).checkpoint }), { code: 'POLICY_DENIED' });
  }
});
