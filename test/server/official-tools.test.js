import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { createOfficialToolAdapter, inspectOfficialToolConnection } from '../../server/production/official-tools.js';
import { accessCatalog } from '../../packs/production/access-catalog.js';
import { syntheticOfficialTools } from '../../examples/support/synthetic-official-tools.js';

const accessSpec = accessCatalog.find((spec) => spec.id === 'meshy-preview-official-mcp-v1');
const sourceId = `sha256:${'a'.repeat(64)}`;
const prompt = 'Synthetic source model';
function request(parameters = {}) {
  return { version: 1, ...accessSpec.identity, parameters: { mode: 'preview', prompt, ai_model: 'meshy-7.1', target_formats: ['glb'], ...parameters },
    inputBindings: [{ fieldPath: 'prompt', revisionId: sourceId, role: 'prompt' }],
    outputSpec: { groupPolicy: 'fixed', groups: [{ groupId: 'A', slots: [
      { role: 'model', required: true, acceptableMediaTypes: ['model/gltf-binary'] },
      { role: 'bundle', required: true, acceptableMediaTypes: ['application/json'] },
    ] }] } };
}
async function setup(options = {}, ready = async () => {}) {
  const fixture = syntheticOfficialTools(options);
  const adapter = createOfficialToolAdapter({ tools: fixture.tools, accessSpec, accountAlias: 'account-synthetic', projectAlias: 'project-synthetic',
    accessSpecificationRevisionId: `sha256:${'b'.repeat(64)}`, requestRevisionId: `sha256:${'c'.repeat(64)}`, outputDirectory: tmpdir(), assertReady: async (scope) => { await ready(scope); return { ...scope, ready: true }; } });
  const prepared = await adapter.prepare(request(), [{ revisionId: sourceId, mediaType: 'text/plain', bytes: Buffer.from(prompt) }]);
  return { fixture, adapter, prepared };
}

test('official tool projection reuses pinned preview parameters and resumes a partial download without another generation', async () => {
  const bytes = Buffer.from('synthetic model'); let checked = 0;
  const { fixture, adapter, prepared } = await setup({ bytes, downloadFailures: 1 }, async ({ request: pinned }) => {
    checked++; assert.equal(pinned.inputBindings[0].revisionId, sourceId);
  });
  const submission = await adapter.submit(prepared);
  assert.equal(checked, 1); assert.equal(submission.status, 'accepted');
  assert.equal(fixture.prompt, prompt);
  const invocation = fixture.calls.find((call) => call.role === 'create');
  assert.equal(invocation.args.mode, undefined); assert.equal(invocation.args.api_key, undefined);
  assert.equal(submission.nativeRecords[0].record.sdkDefaults.moderation, false);
  assert.equal((await adapter.inspect(submission.handle)).status, 'complete');
  const partial = await adapter.collect(submission.handle);
  assert.equal(partial.status, 'partial'); assert.equal(partial.artifacts.length, 0);
  const complete = await adapter.collect(submission.handle);
  assert.equal(complete.status, 'complete'); assert.deepEqual(complete.artifacts[0].bytes, bytes);
  assert.equal(fixture.counters.create, 1); assert.equal(fixture.counters.download, 2);
  for (const value of [submission, partial, complete]) assert.ok(!JSON.stringify(value).includes('SYNTHETIC-HOST-SECRET'));
});

test('tool discovery is separate from authentication, feature permission, plan and credits', async () => {
  for (const [kind, status] of [['authentication', 'blocked'], ['permission', 'blocked'], ['plan', 'blocked'], ['credits', 'unknown'], ['authentication', 'expired']]) {
    const f = syntheticOfficialTools({ state: { [kind]: status } });
    const checks = await inspectOfficialToolConnection({ tools: f.tools, accessSpec, probe: f.probe });
    assert.equal(checks.find((item) => item.kind === 'exposure').status, 'passed');
    assert.equal(checks.find((item) => item.kind === kind).status, status);
    assert.ok(!JSON.stringify(checks).includes('SYNTHETIC-HOST-SECRET'));
    assert.equal(f.counters.create, 0);
  }
  const zero = syntheticOfficialTools({ balance: 0 });
  const empty = await inspectOfficialToolConnection({ tools: zero.tools, accessSpec, probe: zero.probe });
  assert.equal(empty.find((item) => item.kind === 'credits').status, 'blocked');
  const missing = syntheticOfficialTools({ missingTool: 'meshy_text_to_3d' });
  const unavailable = await inspectOfficialToolConnection({ tools: missing.tools, accessSpec, probe: missing.probe });
  assert.equal(unavailable.find((item) => item.kind === 'exposure').status, 'blocked'); assert.equal(missing.counters.balance, 0);
  const defaults = await inspectOfficialToolConnection({ tools: zero.tools, accessSpec });
  assert.equal(defaults.find((item) => item.kind === 'authentication').status, 'unknown');
});

test('URL-only fallback, corrupt byte count and unknown file formats cannot become retained outputs', async () => {
  for (const options of [{ urlOnly: true }, { wrongSize: true }]) {
    const { adapter, prepared, fixture } = await setup(options);
    const submission = await adapter.submit(prepared); const collection = await adapter.collect(submission.handle);
    assert.equal(collection.status, 'partial'); assert.equal(collection.artifacts.length, 0);
    assert.equal(fixture.counters.create, 1);
    assert.ok(!JSON.stringify(collection).includes('SYNTHETIC-HOST-SECRET'));
  }
});

test('fresh readiness refusal crosses no provider generation boundary and incompatible tool schemas fail closed', async () => {
  const f = await setup({}, async () => { throw new Error('not current'); });
  await assert.rejects(() => f.adapter.submit(f.prepared), /official host call failed/); assert.equal(f.fixture.counters.create, 0);
  const missing = await setup({ missingTool: 'meshy_download_model' });
  const result = await missing.adapter.submit(missing.prepared);
  assert.equal(result.status, 'submission-unknown'); assert.equal(missing.fixture.counters.create, 0);
  const g = await setup();
  const listing = await g.fixture.tools.list(); listing.tools[0].inputSchema.properties.prompt.type = 'number';
  g.fixture.tools.list = async () => listing;
  assert.equal((await g.adapter.submit(g.prepared)).status, 'submission-unknown'); assert.equal(g.fixture.counters.create, 0);
  await assert.rejects(() => g.adapter.prepare(request({ prompt: 'x' }), []), /PRODUCTION_INPUT_INVALID/);
  await assert.rejects(() => g.adapter.prepare(request({ api_key: 'must-not-enter' }), []), /PRODUCTION_INPUT_INVALID/);
});

test('declarations and partial host observations cannot stand in for observed connection checks', async () => {
  const f = syntheticOfficialTools();
  const checks = await inspectOfficialToolConnection({ tools: f.tools, accessSpec, probe: async () => [
    { kind: 'authentication', status: 'passed', basis: 'user-declaration', reasonCode: 'verified', token: 'secret' },
    { kind: 'plan', status: 'partial', basis: 'read-only-host-probe', reasonCode: 'partial-check' },
  ] });
  assert.equal(checks.find((item) => item.kind === 'authentication').status, 'unknown');
  assert.equal(checks.find((item) => item.kind === 'plan').status, 'partial');
  assert.equal(checks.find((item) => item.kind === 'credits').status, 'unknown');
  assert.ok(!JSON.stringify(checks).includes('secret'));
});


test('raw provider errors, malformed responses and unprepared requests cannot escape as retained diagnostics', async () => {
  const f = await setup();
  const submitted = await f.adapter.submit(f.prepared);
  f.fixture.tools.call = async () => { throw new Error('Authorization Bearer TOP-SECRET'); };
  await assert.rejects(() => f.adapter.inspect(submitted.handle), (error) => {
    assert.ok(!JSON.stringify(error).includes('TOP-SECRET')); assert.ok(!error.message.includes('TOP-SECRET'));
    return error.code === 'PRODUCTION_INPUT_INVALID';
  });
  await assert.rejects(() => f.adapter.submit(structuredClone(f.prepared)), /prepared request/);
  const malformed = await setup();
  const handle = (await malformed.adapter.submit(malformed.prepared)).handle;
  malformed.fixture.tools.call = async () => ({ content: [{ type: 'text', text: 'malformed TOP-SECRET' }] });
  await assert.rejects(() => malformed.adapter.inspect(handle), (error) => !error.message.includes('TOP-SECRET'));
});

test('fresh connection callback must confirm exact route/request/account/project identities', async () => {
  const f = syntheticOfficialTools();
  const options = { tools: f.tools, accessSpec, accountAlias: 'account-synthetic', projectAlias: 'project-synthetic',
    accessSpecificationRevisionId: `sha256:${'b'.repeat(64)}`, requestRevisionId: `sha256:${'c'.repeat(64)}`, outputDirectory: tmpdir() };
  for (const confirm of [undefined, { ready: true }, { ...options, ready: true, projectAlias: 'project-other' }]) {
    const adapter = createOfficialToolAdapter({ ...options, assertReady: async () => confirm });
    const prepared = await adapter.prepare(request(), [{ revisionId: sourceId, mediaType: 'text/plain', bytes: Buffer.from(prompt) }]);
    await assert.rejects(() => adapter.submit(prepared), /fresh connection confirmation/);
  }
  assert.equal(f.counters.create, 0);
});

test('discovery rejects incompatible array items, critical booleans and narrowed enums before any generation', async () => {
  for (const change of [
    (tools) => { tools[0].inputSchema.properties.target_formats.items.type = 'number'; },
    (tools) => { tools[1].inputSchema.properties.wait.type = 'string'; },
    (tools) => { tools[2].inputSchema.properties.include_textures.type = 'string'; },
    (tools) => { tools[0].inputSchema.properties.ai_model.enum = ['meshy-other']; },
    (tools) => { tools[0].inputSchema.properties.target_formats.items.enum = ['obj']; },
    (tools) => { tools[3].inputSchema.properties.response_format.enum = ['markdown']; },
  ]) {
    const f = await setup(); const listing = await f.fixture.tools.list(); change(listing.tools);
    f.fixture.tools.list = async () => listing;
    const checks = await inspectOfficialToolConnection({ tools: f.fixture.tools, accessSpec, probe: f.fixture.probe });
    assert.equal(checks.find((item) => item.kind === 'exposure').status, 'blocked');
    const result = await f.adapter.submit(f.prepared);
    assert.equal(result.status, 'submission-unknown'); assert.equal(f.fixture.counters.create, 0);
  }
});

test('supported JSON Schema unions and actual argument bounds are checked without coercion', async () => {
  const f = await setup(); const listing = await f.fixture.tools.list();
  listing.tools[0].inputSchema.properties.prompt = { anyOf: [{ type: 'string', minLength: 2, maxLength: 800 }, { type: 'null' }] };
  listing.tools[0].inputSchema.properties.ai_model.type = ['string', 'null'];
  listing.tools[0].inputSchema.properties.target_formats.items.enum = ['glb', 'obj'];
  listing.tools[1].inputSchema.properties.timeout_seconds.type = ['integer', 'null'];
  f.fixture.tools.list = async () => listing;
  const result = await f.adapter.submit(f.prepared);
  assert.equal(result.status, 'accepted'); assert.equal((await f.adapter.inspect(result.handle)).status, 'complete');
  const narrow = await setup(); const schema = await narrow.fixture.tools.list();
  schema.tools[0].inputSchema.properties.prompt.maxLength = 2;
  narrow.fixture.tools.list = async () => schema;
  assert.equal((await narrow.adapter.submit(narrow.prepared)).status, 'submission-unknown');
  assert.equal(narrow.fixture.counters.create, 0);
});

test('requested download formats outside the discovered tool enum are blocked before generation', async () => {
  const f = await setup();
  const listing = await f.fixture.tools.list();
  listing.tools[2].inputSchema.properties.format.enum = ['glb'];
  f.fixture.tools.list = async () => listing;
  const requested = request({ target_formats: ['obj'] });
  const prepared = await f.adapter.prepare(requested, [{ revisionId: sourceId, mediaType: 'text/plain', bytes: Buffer.from(prompt) }]);
  assert.equal((await f.adapter.submit(prepared)).status, 'submission-unknown');
  assert.equal(f.fixture.counters.create, 0);
});
