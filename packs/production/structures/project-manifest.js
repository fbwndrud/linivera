import { assertBundlePath } from '../../../core/resources/bundle-path.js';
import { array, invalid, object, projection } from './common.js';

function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('unknown project declaration field');
}
function text(value, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\p{Cc}/u.test(value)) invalid('bounded project identifier required');
  return value;
}
function flag(value) { if (typeof value !== 'boolean') invalid('explicit required flag needed'); return value; }
function unique(values, label) {
  array(values, label); if (new Set(values).size !== values.length) invalid(`duplicate ${label}`); return values;
}

/** A user's explicit file/state contract, never an inferred vendor or runtime dependency graph. */
export function projectManifest(value) {
  fields(value, ['version', 'files', 'entrypoints', 'dependencies', 'externalStates']);
  if (value.version !== 1) invalid('project declaration version 1 required');
  const p = projection('project-manifest'); const files = new Map();
  for (const [i, file] of array(value.files, 'project files').entries()) {
    fields(file, ['path', 'role', 'required']);
    try { assertBundlePath(file.path); } catch { invalid('normalized relative project file path required'); }
    if (files.has(file.path)) invalid('duplicate project path');
    files.set(file.path, { id: `/files/${i}`, role: text(file.role), required: flag(file.required), dependencies: [] });
  }
  if (!files.size) invalid('at least one project file required');
  for (const path of files.keys()) for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1)) {
    if (files.has(path.slice(0, slash))) invalid('project file/directory path conflict');
  }
  function file(path) { const row = files.get(path); if (!row) invalid('project relation names an undeclared file'); return row; }
  const entrypoints = new Set(unique(value.entrypoints ?? [], 'entrypoints'));
  for (const path of entrypoints) file(path).required = true;
  const relations = []; const seen = new Set();
  for (const [i, edge] of array(value.dependencies ?? [], 'dependencies').entries()) {
    fields(edge, ['from', 'to', 'kind']); const source = file(edge.from); const target = file(edge.to); const role = text(edge.kind);
    const key = JSON.stringify([edge.from, edge.to, role]); if (seen.has(key)) invalid('duplicate project dependency'); seen.add(key);
    source.dependencies.push(target);
    relations.push({ source: source.id, target: target.id, role, locator: `/dependencies/${i}` });
  }
  const states = []; const stateIds = new Set();
  for (const [i, state] of array(value.externalStates ?? [], 'external states').entries()) {
    fields(state, ['id', 'kind', 'required', 'evidence', 'unavailable']);
    const name = text(state.id); if (stateIds.has(name)) invalid('duplicate external state id'); stateIds.add(name);
    if (!['database', 'environment', 'deployment'].includes(state.kind)) invalid('unsupported external state kind');
    const required = flag(state.required); const evidence = unique(state.evidence, 'state evidence');
    for (const path of evidence) if (required) file(path).required = true; else file(path);
    const missing = unique(state.unavailable, 'state omissions').map((reason) => text(reason, 2048));
    states.push({ id: `/externalStates/${i}`, name, kind: state.kind, required, evidence, missing });
  }
  // Required entrypoints and state evidence carry their declared transitive dependencies.
  const queue = [...files.values()].filter((row) => row.required);
  for (let i = 0; i < queue.length; i++) for (const target of queue[i].dependencies) if (!target.required) { target.required = true; queue.push(target); }
  for (const [path, row] of files) {
    p.unit(row.id, 'project-file', { path, role: row.role, required: row.required, entrypoint: entrypoints.has(path) });
    p.ref(row.id + '/path', row.id, row.role, path, row.required);
  }
  for (const { source, target, ...details } of relations) p.link(source, target, 'declared-dependency', details);
  for (const state of states) {
    p.unit(state.id, 'external-state', { name: state.name, stateKind: state.kind, required: state.required });
    for (const [i, path] of state.evidence.entries()) p.link(state.id, file(path).id, 'state-evidence', { locator: `${state.id}/evidence/${i}` });
    if (!state.evidence.length) p.ref(state.id + '/@evidence', state.id, state.kind + '-state', `Missing evidence: ${state.name}`, state.required);
    for (const [i, reason] of state.missing.entries()) p.ref(`${state.id}/unavailable/${i}`, state.id, state.kind + '-state', reason, state.required);
    if (!state.evidence.length || state.missing.length) p.unknown(`Unretained ${state.kind} state: ${state.name}`);
    p.unknown(`Declared ${state.kind} evidence for ${state.name}; live runtime state, restore and deployment have not been verified.`);
  }
  p.unknown('Explicit project declaration only; undeclared code imports, engine scenes and hidden dependencies are not inferred.');
  return p.finish();
}
