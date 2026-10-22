import { array, invalid, object, projection } from './common.js';
import { fields, text } from './record-values.js';
import { nativeRecord } from '../native-records.js';

/** Display metadata is bounded; URLs remain in the retained source, not copied to maps. */
export function reportedText(value, max = 512) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  return text(nativeRecord('field', text(value, max)).record.replace(/https?:\/\/[^\s"<>]+/g, '[external-url]'), max);
}
export function responseProjection(format, provider, endpoint) {
  const p = projection(format);
  p.unknown(`Reported ${provider} response for ${endpoint}; original generation inputs, account authenticity, quality and authorization are not proven.`);
  p.unknown('Other native fields remain in the source. Output locators do not fetch files or verify remote byte identity.');
  return p;
}
function at(value, locator) {
  text(locator, 2048);
  if (!locator.startsWith('/') || /~(?![01])/.test(locator)) invalid('RFC 6901 JSON Pointer required');
  const keys = locator.slice(1).split('/'); if (keys.length > 64) invalid('JSON Pointer exceeds depth budget');
  let current = value;
  for (const encoded of keys) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (current === null || typeof current !== 'object' || Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}
export function declaredResponse(value, declaration) {
  fields(declaration, ['version', 'provider', 'endpoint', 'schemaVersion', 'taskIdPointer', 'statusPointer', 'outputs']);
  if (declaration.version !== 1 || !(object(value) || Array.isArray(value))) invalid('versioned response declaration and JSON object/array required');
  const provider = text(declaration.provider, 128); const endpoint = text(declaration.endpoint, 512); const schemaVersion = text(declaration.schemaVersion, 128);
  const p = responseProjection('provider-response', provider, endpoint);
  const metadata = { provider, endpoint, schemaVersion, taskId: null, status: null };
  for (const [field, pointerField] of [['taskId', 'taskIdPointer'], ['status', 'statusPointer']]) {
    if (declaration[pointerField] === undefined) { p.unknown(`Unreported response ${field}`); continue; }
    const observed = at(value, declaration[pointerField]);
    if (observed == null) p.unknown(`Unreported response ${field} at ${declaration[pointerField]}`);
    else metadata[field] = reportedText(observed);
  }
  p.unit('/', 'provider-response', metadata); const seen = new Set();
  for (const [i, output] of array(declaration.outputs, 'declared response outputs').entries()) {
    fields(output, ['pointer', 'role', 'required']); const locator = text(output.pointer, 2048); const role = text(output.role, 128);
    if (seen.has(locator) || typeof output.required !== 'boolean') invalid('unique output pointer and explicit required flag needed'); seen.add(locator);
    const observed = at(value, locator); const id = `/@outputs/${i}`;
    if (observed == null || observed === '') p.unknown(`Missing declared output at ${locator}`);
    else if (!(typeof observed === 'string' || typeof observed === 'number' && Number.isSafeInteger(observed))) invalid('declared output must be a scalar file locator or explicit missing slot');
    p.unit(id, 'provider-output', { role, locator, observed: observed != null && observed !== '' }); p.link('/', id, 'response-output');
    p.ref(locator, id, role, `Reported ${role} at ${locator}`, output.required);
  }
  return p.finish();
}
