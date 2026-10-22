import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Public-MCP helpers shared by the single-workspace P0~P4 scenario. */
export function chromaStages(host) {
  const { call, json, select } = host; const resources = new Map();
  async function define(scope, { maxInputBytes = 8 * 1024 * 1024, profileId = 'profile', apply = true } = {}) {
    const ids = {};
    for (const [kind, id, value] of [['profile', profileId, { version: 1, scope, maxInputBytes }], ['pipeline', 'pipeline', { version: 1, steps: [{ id: 'iterate', capability: 'analyze' }] }],
      ['policy', 'policy', { version: 1, scope, allowedActions: ['create-candidate', 'publish', 'select-source'] }]]) {
      if (!apply && kind !== 'profile') { ids[kind + 'RevisionId'] = host.definitions[kind + 'RevisionId']; continue; }
      const r = await call('folio_resources', { op: 'propose', resourceId: id, kind, owned: { bytes: JSON.stringify(value), mediaType: 'application/json' } });
      await select(r); ids[kind + 'RevisionId'] = r.revisionId;
    }
    if (apply) Object.assign(host.definitions, ids);
    return ids;
  }
  async function keep(id, revision) { await select(revision); resources.set(id, revision); return revision; }
  /** Files arrive in a host download folder, are retained by path and then deleted. */
  async function importDownloads(dir, files) {
    await mkdir(dir, { recursive: true }); const originals = new Map();
    for (const [id, { bytes, mediaType, kind = 'provider-download' }] of Object.entries(files)) {
      const path = join(dir, id + '.download'); await writeFile(path, bytes); originals.set(id, Buffer.from(bytes));
      await keep(id, await call('folio_resources', { op: 'importFile', resourceId: id, kind, path, mediaType }));
    }
    await rm(dir, { recursive: true, force: true }); assert.deepEqual(await readdir(dir).catch(() => []), []);
    return originals;
  }
  /** Operation results stay unselected until the host review and user decision in produce(). */
  async function draft(id, bytes, mediaType, kind = 'synthetic-artifact') {
    const owned = Buffer.isBuffer(bytes) ? { base64: bytes.toString('base64'), mediaType } : { bytes, mediaType };
    const revision = await call('folio_resources', { op: 'propose', resourceId: id, kind, owned }); resources.set(id, revision); return revision;
  }
  const draftJson = (id, value, kind = 'synthetic') => draft(id, JSON.stringify(value), 'application/json', kind);
  const retain = async (id, bytes, mediaType, kind) => keep(id, await draft(id, bytes, mediaType, kind));
  const retainJson = async (id, value, kind = 'synthetic') => keep(id, await json(id, value, kind));
  async function connect(id, sourceId, format, targets, extras = {}) {
    const source = resources.get(sourceId); const inspected = await call('folio_resources', { op: 'inspectStructure', revisionId: source.revisionId, format, ...extras });
    const structureBindings = inspected.structure.references.flatMap((ref) => {
      const name = [ref.key, ref.role, ref.hint].find((candidate) => Object.hasOwn(targets, candidate)); const targetId = targets[name];
      if (targetId === null) return [];
      assert.ok(resources.get(targetId), `${id}: ${ref.key}`); return [{ referenceKey: ref.key, revisionId: resources.get(targetId).revisionId }];
    });
    return keep(id, await call('folio_resources', { op: 'normalizeStructure', resourceId: id, sourceRevisionId: source.revisionId, format, structureBindings, ...extras }));
  }
  async function readJson(idOrRevision) {
    const revision = typeof idOrRevision === 'string' ? resources.get(idOrRevision) : idOrRevision;
    return JSON.parse((await call('folio_resources', { op: 'read', revisionId: revision.revisionId })).content);
  }
  async function readBytes(id) {
    const read = await call('folio_resources', { op: 'read', revisionId: resources.get(id).revisionId });
    return read.base64 !== undefined ? Buffer.from(read.base64, 'base64') : Buffer.from(read.content);
  }
  /** One operation: the output is created from values the host read out of the sealed input. */
  async function produce(id, snapshot, create) {
    const op = await call('folio_operations', { op: 'start', inputSnapshotId: snapshot.inputSnapshotId, actor: 'user', idempotencyKey: id });
    const output = await create();
    await call('folio_operations', { op: 'submit', ...op, inputSnapshotId: snapshot.inputSnapshotId, resultRevisionIds: [output.revisionId] });
    await host.approve(op.operationId, output.revisionId); resources.set(id, output); return { output, snapshot, operationId: op.operationId };
  }
  const prepare = (ids, definitions = host.definitions) => call('folio_inputs', { op: 'prepare', ...definitions, revisionIds: ids.map((id) => resources.get(id).revisionId) });
  async function reasons(id) {
    await call('folio_resource_query', { op: 'refresh' }); const query = await call('folio_resource_query', { op: 'query', resourceId: id });
    const entry = query.entries.find((e) => e.role === 'output' && e.revisionId === resources.get(id).revisionId);
    return entry?.reviewReasons ?? [];
  }
  return { resources, define, keep, importDownloads, draft, draftJson, retain, retainJson, connect, readJson, readBytes, produce, prepare, reasons };
}
