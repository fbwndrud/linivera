import { array, invalid, object, pointer, projection } from './common.js';

const statuses = new Set(['pending', 'running', 'completed', 'failed', 'needs_revision', 'rejected', 'superseded', 'rerunning', 'cancelled']);
function identity(value) { return typeof value === 'string' && value.length > 0 && value.length <= 512; }
function observed(row) {
  if (!object(row) || !identity(row.id) || !statuses.has(row.status)) invalid('run, action and item require IDs and recognized observed status');
  return { nativeId: row.id, reportedStatus: row.status };
}
export function martiniRun(value) {
  const p = projection('martini-run');
  p.unit('/', 'run', { ...observed(value), ...(identity(value.fingerprint) ? { machineryFingerprint: value.fingerprint } : {}) });
  const actions = array(value.actions, 'actions'); const items = array(value.items, 'items');
  const actionIds = new Map(); const itemIds = new Map(); const inputs = new Map();
  if (value.savedWorkflow != null) {
    if (!object(value.savedWorkflow) || !identity(value.savedWorkflow.id)) invalid('saved workflow must name an ID');
    p.ref('/savedWorkflow/id', '/', 'workflow-definition', value.savedWorkflow.id, false);
  }
  if (!object(value.variables ?? {}) || !object(value.bins ?? {})) invalid('run variables and bins must be objects');
  for (const [name, text] of Object.entries(value.variables ?? {})) {
    if (typeof text !== 'string') invalid('run variable must be text');
    const id = p.unit(`/variables/${pointer(name)}`, 'variable', { nativeId: name }); inputs.set(name, [...(inputs.get(name) ?? []), id]);
    p.link('/', id, 'pinned-variable');
  }
  for (const [name, assets] of Object.entries(value.bins ?? {})) {
    const id = p.unit(`/bins/${pointer(name)}`, 'bin', { nativeId: name }); inputs.set(name, [...(inputs.get(name) ?? []), id]); p.link('/', id, 'pinned-bin');
    for (const [index, assetId] of array(assets, 'bin assets').entries()) p.ref(`${id}/${index}`, id, 'input-asset', assetId);
  }
  for (const [index, action] of actions.entries()) {
    const id = p.unit(`/actions/${index}`, 'action', observed(action));
    if (actionIds.has(action.id)) invalid('duplicate action ID');
    actionIds.set(action.id, id); p.link('/', id, 'run-action', { order: index });
  }
  for (const [index, item] of items.entries()) {
    const id = p.unit(`/items/${index}`, 'item', { ...observed(item), ...(item.verdict == null ? {} : { reportedVerdict: item.verdict }) });
    if (itemIds.has(item.id) || !actionIds.has(item.actionId)) invalid('duplicate item or missing action');
    itemIds.set(item.id, id); p.link(actionIds.get(item.actionId), id, 'action-item');
    if (item.outputAssetId != null) p.ref(`${id}/outputAssetId`, id, 'output-asset', item.outputAssetId);
  }
  for (const [index, item] of items.entries()) {
    const id = `/items/${index}`;
    if (item.replacesItemId != null) {
      if (!identity(item.replacesItemId) || item.replacesItemId === item.id) invalid('invalid replacement item');
      if (itemIds.has(item.replacesItemId)) p.link(id, itemIds.get(item.replacesItemId), 'replaces');
      else { p.ref(`${id}/replacesItemId`, id, 'previous-take-record', item.replacesItemId); p.unknown('Replacement refers to a take outside this retained run.'); }
    }
    if (item.revision != null) {
      if (!object(item.revision)) invalid('revision observation must be an object');
      for (const name of array(item.revision.inputRefs ?? [], 'revision inputRefs')) {
        if (inputs.get(name)?.length === 1) p.link(id, inputs.get(name)[0], 'revision-input');
        else if (inputs.has(name)) p.unknown('A revision input name is ambiguous across variable and bin namespaces.');
        else p.unknown('A revision input name is not present in this retained run.');
      }
    }
  }
  p.unknown('Observed statuses and verdicts are supplier reports, not Linivera approval or causal execution receipts.');
  p.unknown('Workflow definitions, canvas defaults, events and unreported dependencies are not interpreted.');
  return p.finish();
}
