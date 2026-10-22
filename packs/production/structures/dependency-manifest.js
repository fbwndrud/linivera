import { array, invalid, object } from './common.js';

const name = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512;
function fields(value, allowed, required) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) invalid('invalid dependency manifest fields');
}
export function dependencyManifest(value) {
  fields(value, ['version', 'nodes'], ['version', 'nodes']);
  if (value.version !== 1) invalid('dependency manifest version 1 required');
  const nodes = new Map();
  for (const row of array(value.nodes, 'dependency nodes')) {
    fields(row, ['classType', 'package', 'files'], ['classType', 'package', 'files']);
    if (!name(row.classType) || nodes.has(row.classType)) invalid('unique dependency classType required');
    fields(row.package, ['id', 'version', 'revision', 'repository'], ['id', 'version']);
    for (const key of Object.keys(row.package)) if (!name(row.package[key])) invalid('package identity/version fields require bounded text');
    const seen = new Set();
    for (const file of array(row.files, 'declared files')) {
      fields(file, ['input', 'role', 'widgetIndex'], ['input', 'role']);
      if (!name(file.input) || !name(file.role) || seen.has(file.input) || (file.widgetIndex !== undefined && (!Number.isSafeInteger(file.widgetIndex) || file.widgetIndex < 0 || file.widgetIndex >= 4096))) invalid('unique file inputs and explicit bounded widget positions required');
      seen.add(file.input);
    }
    nodes.set(row.classType, row);
  }
  return nodes;
}
