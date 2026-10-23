import { FolioError } from '../../core/errors.js';
import { canonicalJson } from '../../core/util/hash.js';
import { validateProductionRequest } from './request-schema.js';
import { capabilityCatalog } from './capability-catalog.js';
import { validateFalParameters, validateSpeechParameters, validateMeshyParameters } from '../../adapters/production/request-schemas.js';
import { MESHY_MODEL_MEDIA_TYPES } from '../../adapters/production/meshy-formats.js';
import { createCatalogRegistry } from './catalog-registry.js';
import { capabilityReleases } from './catalog-releases.js';

function invalid(message) { throw new FolioError('CAPABILITY_SPEC_INVALID', message); }
const registry = createCatalogRegistry(capabilityCatalog, capabilityReleases, 'CAPABILITY_SPEC_INVALID');
export const listCapabilitySpecs = () => registry.list();
export const getCapabilitySpec = (id) => registry.get(id);
/** Only shipped, evidence-scoped contracts are executable. Altered declarations cannot claim official status. */
export function validateCapabilitySpec(value) {
  const expected = getCapabilitySpec(value?.id);
  if (canonicalJson(value) !== canonicalJson(expected)) invalid('capability specification differs from the versioned catalog');
  return expected;
}
export function validateCapabilityValue(input, value) {
  const c = input.constraints;
  if (value === null && c.nullable) return;
  const validType = input.dataType === 'array' ? Array.isArray(value)
    : input.dataType === 'integer' ? Number.isSafeInteger(value)
      : input.dataType === 'number' ? Number.isFinite(value)
        : input.dataType === 'object' ? value && typeof value === 'object' && !Array.isArray(value)
          : input.dataType === 'string-or-size' ? typeof value === 'string' || value && typeof value === 'object' && !Array.isArray(value)
            : typeof value === input.dataType;
  if (!validType) invalid(`invalid value type for ${input.fieldPath}`);
  if (c.enum && !(input.dataType === 'string-or-size' && typeof value === 'object') && !c.enum.includes(value)) invalid(`unsupported value for ${input.fieldPath}`);
  if (typeof value === 'string' && (value.length < (c.minLength ?? 0) || value.length > (c.maxLength ?? Infinity) || c.nonBlank && !value.trim())) invalid(`text constraint failed for ${input.fieldPath}`);
  if (typeof value === 'number' && (value < (c.minimum ?? -Infinity) || value > (c.maximum ?? Infinity))) invalid(`numeric constraint failed for ${input.fieldPath}`);
  if (c.positiveDimensions && typeof value === 'object' && (Object.keys(value).some((key) => !['width', 'height'].includes(key))
    || !['width', 'height'].every((key) => Number.isSafeInteger(value[key]) && value[key] > 0))) invalid(`positive width and height required for ${input.fieldPath}`);
  if (c.propertyTypes) for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(c.propertyTypes, key) || (c.propertyTypes[key] === 'number' ? !Number.isFinite(item) : typeof item !== c.propertyTypes[key])) invalid(`typed object property required for ${input.fieldPath}.${key}`);
  }
  if (Array.isArray(value)) {
    if (value.length < (c.minItems ?? 0) || value.length > (c.maxItems ?? Infinity) || c.uniqueItems && new Set(value).size !== value.length) invalid(`array constraint failed for ${input.fieldPath}`);
    for (const item of value) {
      if (c.itemType && typeof item !== c.itemType || c.itemEnum && !c.itemEnum.includes(item)) invalid(`array item constraint failed for ${input.fieldPath}`);
      if (c.itemRequiredStrings && (!item || c.itemRequiredStrings.some((key) => typeof item[key] !== 'string' || !item[key]))) invalid(`array object constraint failed for ${input.fieldPath}`);
    }
  }
}
function validateOutput(spec, request, historicalV1) {
  if (request.outputSpec.groupPolicy !== 'fixed') invalid('representative capability requires fixed output groups');
  const groups = request.outputSpec.groups;
  const expected = spec.id === 'fal-flux-schnell-v1' ? request.parameters.num_images ?? 1 : 1;
  if (groups.length !== expected) invalid('output groups differ from capability cardinality');
  for (const group of groups) {
    for (const output of spec.outputs) {
      const slot = group.slots.find((item) => item.role === output.role);
      if (output.required && (!slot || !slot.required)) invalid(`required output role missing: ${output.role}`);
      if (slot && (slot.acceptableMediaTypes.some((type) => !output.mediaTypes.includes(type))
        || (slot.cardinality ?? 1) > output.maxCount)) invalid(`unsupported output slot: ${output.role}`);
      if (slot && output.countFrom === 'target_formats' && (slot.cardinality ?? 1) !== request.parameters.target_formats.length) invalid('model output cardinality must equal selected formats');
      if (!historicalV1 && slot && output.countFrom === 'target_formats' && request.parameters.target_formats.some((format) => !slot.acceptableMediaTypes.includes(MESHY_MODEL_MEDIA_TYPES[format]))) invalid('model output slot must accept every selected format');
      if (slot && spec.id === 'fal-flux-schnell-v1' && slot.acceptableMediaTypes.some((type) => type !== `image/${request.parameters.output_format ?? 'jpeg'}`)) invalid('image output slot disagrees with requested format');
    }
    if (group.slots.some((slot) => !spec.outputs.some((output) => output.role === slot.role))) invalid('undeclared capability output role');
  }
}
/** Pure validation: it does not attest Resource bytes, rights, availability, selection, or approval. */
function validateRequest(specOrId, request, historicalV1 = false) {
  const spec = typeof specOrId === 'string' ? getCapabilitySpec(specOrId) : validateCapabilitySpec(specOrId);
  validateProductionRequest(request);
  for (const key of ['provider', 'product', 'capability', 'schemaVersion']) if (request[key] !== spec.identity[key]) invalid(`capability identity mismatch: ${key}`);
  if (spec.endpointPattern ? !new RegExp(spec.endpointPattern).test(request.endpoint) : request.endpoint !== spec.identity.endpoint) invalid('capability endpoint mismatch');
  if ((request.model ?? request.parameters[spec.modelParameter] ?? spec.identity.model) !== spec.identity.model) invalid('capability model mismatch');
  const parameterInputs = spec.inputs.filter((input) => ['text', 'parameter'].includes(input.source));
  if (Object.keys(request.parameters).some((key) => !parameterInputs.some((input) => input.fieldPath === key))) invalid('undeclared capability parameter');
  for (const input of parameterInputs) {
    const value = request.parameters[input.fieldPath];
    if (value === undefined) { if (input.requirement === 'required') invalid(`required parameter missing: ${input.fieldPath}`); continue; }
    validateCapabilityValue(input, value);
  }
  for (const input of spec.inputs.filter((item) => item.source !== 'parameter')) {
    const required = input.requirement === 'required' || input.source === 'text' && request.parameters[input.fieldPath] != null;
    const binding = request.inputBindings.find((item) => item.fieldPath === input.fieldPath);
    if (required && !binding) invalid(`exact input binding required: ${input.fieldPath}`);
    if (binding && input.source === 'text' && typeof request.parameters[input.fieldPath] !== 'string') invalid(`unused text binding: ${input.fieldPath}`);
  }
  if (request.inputBindings.some((binding) => !spec.inputs.some((input) => input.source !== 'parameter' && input.fieldPath === binding.fieldPath))) invalid('undeclared capability input binding');
  if (spec.id === 'fal-flux-schnell-v1') validateFalParameters(request.parameters);
  if (spec.id === 'elevenlabs-tts-timestamps-v1') validateSpeechParameters(request.parameters);
  if (spec.id === 'meshy-text-to-3d-preview-v1') validateMeshyParameters(request.parameters);
  validateOutput(spec, request, historicalV1);
  return request;
}
export function validateCapabilityRequest(specOrId, request) { return validateRequest(specOrId, request); }
/** Replay v1 evidence only. New preparation and execution always apply the current contract separately. */
export function validateHistoricalCapabilityRequestV1(specOrId, request) { return validateRequest(specOrId, request, true); }
