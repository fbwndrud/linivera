// Annotations never change whether an input is valid. Every other supported keyword is evaluated.
const annotations = ['$schema', '$id', 'title', 'description', 'default', 'examples', '$comment', 'deprecated', 'readOnly', 'writeOnly'];
const rootKeywords = ['type', 'properties', 'required', 'additionalProperties', ...annotations];
const valueKeywords = ['type', 'anyOf', 'oneOf', 'allOf', 'const', 'enum', 'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'uniqueItems', 'items', ...annotations];

function valueSchemaSupported(schema, depth = 0) {
  if (depth > 16 || !schema || typeof schema !== 'object' || Array.isArray(schema)
    || Object.keys(schema).some((key) => !valueKeywords.includes(key))) return false;
  const types = schema.type === undefined ? [] : [schema.type].flat();
  if (types.some((type) => !['string', 'number', 'integer', 'boolean', 'array', 'null'].includes(type))) return false;
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some((item) => item && typeof item === 'object'))) return false;
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (schema[key] !== undefined
    && (!Array.isArray(schema[key]) || !schema[key].length || !schema[key].every((part) => valueSchemaSupported(part, depth + 1)))) return false;
  if (schema.items !== undefined && !valueSchemaSupported(schema.items, depth + 1)) return false;
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (schema[key] !== undefined
    && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) return false;
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) if (schema[key] !== undefined
    && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]))) return false;
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== 'boolean') return false;
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') return false;
    try { new RegExp(schema.pattern); } catch { return false; }
  }
  return types.length > 0 || ['anyOf', 'oneOf', 'allOf'].some((key) => schema[key]);
}

/** Unknown assertions and refs make discovery unverified; annotations are safe to ignore. */
export function toolSchemaSupported(schema) {
  return schema?.type === 'object' && Object.keys(schema).every((key) => rootKeywords.includes(key))
    && schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    && (schema.required === undefined || (Array.isArray(schema.required) && schema.required.every((key) => typeof key === 'string')))
    && (schema.additionalProperties === undefined || typeof schema.additionalProperties === 'boolean')
    && Object.values(schema.properties).every((property) => valueSchemaSupported(property));
}
