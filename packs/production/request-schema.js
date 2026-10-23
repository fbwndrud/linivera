import { FolioError } from '../../core/errors.js';
import { assertRevisionId } from '../../core/resources/schema.js';
function invalid(message) { throw new FolioError('PRODUCTION_REQUEST_INVALID', message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function name(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(value); }
export function validateSlots(slots) {
  if (!Array.isArray(slots) || !slots.length || slots.length > 4096) invalid('nonempty bounded output slots required');
  const roles = new Set();
  for (const slot of slots) {
    if (!object(slot) || Object.keys(slot).some((key) => !['role', 'required', 'acceptableMediaTypes', 'cardinality'].includes(key)) || !name(slot.role) || roles.has(slot.role)
      || typeof slot.required !== 'boolean' || !Array.isArray(slot.acceptableMediaTypes) || !slot.acceptableMediaTypes.length
      || slot.acceptableMediaTypes.some((type) => typeof type !== 'string' || !type.includes('/'))
      || (slot.cardinality !== undefined && (!Number.isSafeInteger(slot.cardinality) || slot.cardinality < 1 || slot.cardinality > 4096))) invalid('invalid output slot');
    roles.add(slot.role);
  }
  return slots;
}
export function validateProductionRequest(value) {
  if (!object(value) || value.version !== 1 || Object.keys(value).some((key) => !['version', 'provider', 'product', 'endpoint', 'capability', 'schemaVersion', 'model', 'parameters', 'inputBindings', 'outputSpec', 'iteration'].includes(key))) invalid('unsupported generation-request schema');
  for (const key of ['provider', 'product', 'endpoint', 'capability', 'schemaVersion']) if (typeof value[key] !== 'string' || !value[key].length || value[key].length > 2048) invalid(`invalid ${key}`);
  if (!object(value.parameters) || !Array.isArray(value.inputBindings)) invalid('parameters and input bindings required');
  const paths = new Set();
  for (const binding of value.inputBindings) {
    if (!object(binding) || Object.keys(binding).some((key) => !['fieldPath', 'revisionId', 'role', 'transformRevisionId'].includes(key)) || typeof binding.fieldPath !== 'string' || !binding.fieldPath.length || binding.fieldPath.length > 1024 || paths.has(binding.fieldPath) || !name(binding.role)) invalid('invalid input binding');
    assertRevisionId(binding.revisionId); if (binding.transformRevisionId) assertRevisionId(binding.transformRevisionId);
    paths.add(binding.fieldPath);
  }
  const spec = value.outputSpec;
  if (!object(spec) || Object.keys(spec).some((key) => !['groupPolicy', 'groups', 'groupRules', 'slotsSchema'].includes(key))) invalid('invalid output specification');
  if (spec.groupPolicy === 'fixed') {
    if (!Array.isArray(spec.groups) || !spec.groups.length || spec.groups.length > 4096 || spec.groupRules !== undefined || spec.slotsSchema !== undefined) invalid('fixed groups required');
    const ids = new Set();
    for (const group of spec.groups) {
      if (!object(group) || Object.keys(group).some((key) => !['groupId', 'slots'].includes(key)) || !name(group.groupId) || ids.has(group.groupId)) invalid('invalid fixed group');
      ids.add(group.groupId); validateSlots(group.slots);
    }
  } else if (spec.groupPolicy === 'dynamic') {
    const rules = spec.groupRules;
    if (spec.groups !== undefined || !object(rules) || Object.keys(rules).some((key) => !['keyFields', 'maxGroups', 'allowedKinds'].includes(key)) || !Array.isArray(rules.keyFields) || !rules.keyFields.length || rules.keyFields.some((key) => !name(key)) || new Set(rules.keyFields).size !== rules.keyFields.length || !Number.isSafeInteger(rules.maxGroups) || rules.maxGroups < 1 || rules.maxGroups > 4096 || (rules.allowedKinds !== undefined && (!Array.isArray(rules.allowedKinds) || rules.allowedKinds.some((kind) => !name(kind))))) invalid('bounded dynamic group rules required');
    validateSlots(spec.slotsSchema);
  } else invalid('fixed or dynamic output group policy required');
  return value;
}
