import { invalid } from '../../adapters/production/common.js';

/** Conservative subset of JSON Schema used by the pinned official tool inputs. No coercion or remote refs. */
export function acceptsToolValue(schema, value) {
  if (!schema || typeof schema !== 'object' || schema.$ref) return false;
  if (schema.anyOf && !schema.anyOf.some((part) => acceptsToolValue(part, value))) return false;
  if (schema.oneOf && schema.oneOf.filter((part) => acceptsToolValue(part, value)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every((part) => acceptsToolValue(part, value))) return false;
  if ('const' in schema && schema.const !== value) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  const types = schema.type === undefined ? [] : [schema.type].flat();
  const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (types.length && !types.includes(actualType) && !(actualType === 'number' && Number.isInteger(value) && types.includes('integer'))) return false;
  if (!types.length && !schema.anyOf && !schema.oneOf && !schema.allOf) return false;
  if (typeof value === 'string') {
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) return false;
    try { if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false; } catch { return false; }
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity)
    || value > (schema.maximum ?? Infinity) || (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
    || (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum))) return false;
  if (Array.isArray(value) && (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)
    || (schema.uniqueItems && new Set(value).size !== value.length) || !value.every((item) => acceptsToolValue(schema.items, item)))) return false;
  return true;
}
export function toolSchemaAllowsType(schema, expected) {
  if (!schema || typeof schema !== 'object' || schema.$ref) return false;
  const types = schema.type === undefined ? [] : [schema.type].flat();
  return types.some((type) => expected.includes(type))
    || [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some((part) => toolSchemaAllowsType(part, expected));
}
export function assertKnownToolArguments(schema, args) {
  if (!schema || Object.entries(args).some(([field, value]) => !acceptsToolValue(schema.properties?.[field], value))) invalid('official tool arguments differ from discovered schema');
}
export function assertToolArguments(schema, args) {
  assertKnownToolArguments(schema, args);
  if ((schema.required ?? []).some((field) => !Object.hasOwn(args, field))) invalid('official tool arguments differ from discovered schema');
}
