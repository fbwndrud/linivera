import { invalid } from '../../adapters/production/common.js';
import { acceptsToolValue, toolSchemaAllowsType } from './official-tools-schema.js';

export const MESHY_TOOL_CONTRACT = Object.freeze({ version: 1, implementation: 'meshy-mcp-0.6.5', tools: Object.freeze({
  create: 'meshy_text_to_3d', status: 'meshy_get_task_status', download: 'meshy_download_model', balance: 'meshy_check_balance',
}) });
const required = { create: ['prompt'], status: ['task_id'], download: ['task_id'], balance: [] };
const fields = { create: ['prompt', 'ai_model', 'target_formats', 'should_remesh', 'response_format'],
  status: ['task_id', 'task_type', 'wait', 'timeout_seconds', 'response_format'],
  download: ['task_id', 'task_type', 'format', 'include_textures', 'save_to', 'response_format'], balance: ['response_format'] };

export function assertOfficialSpec(spec) {
  const c = spec?.toolContract;
  if (spec?.route?.kind !== 'mcp' || spec.route.official !== true || spec.route.direction !== 'external-to-provider'
    || spec.route.locator !== '@meshy-ai/meshy-mcp-server' || spec.route.version !== '0.6.5'
    || spec?.identity?.provider !== 'meshy' || spec.identity.capability !== 'text-to-3d'
    || c?.version !== 1 || c.implementation !== MESHY_TOOL_CONTRACT.implementation
    || c.fixedParameters?.mode !== 'preview' || c.fixedParameters.moderation !== false || c.fixedParameters.include_textures !== false
    || Object.keys(c.tools ?? {}).length !== Object.keys(MESHY_TOOL_CONTRACT.tools).length
    || Object.entries(MESHY_TOOL_CONTRACT.tools).some(([key, name]) => c.tools?.[key] !== name)) invalid('pinned supported official Meshy tool contract required');
}
export function assertOfficialDiscovery(result, contract) {
  const tools = Array.isArray(result) ? result : result?.tools;
  if (!Array.isArray(tools)) invalid('host tool discovery is unavailable');
  const schemas = {};
  for (const [role, name] of Object.entries(contract.tools)) {
    const candidates = tools.filter((tool) => tool.name === name);
    const schema = candidates[0]?.inputSchema;
    if (candidates.length !== 1 || schema?.type !== 'object'
      || required[role].some((field) => !schema.required?.includes(field))
      || fields[role].some((field) => !Object.hasOwn(schema.properties ?? {}, field))
      || fields[role].some((field) => {
        const expected = field === 'target_formats' ? ['array'] : ['wait', 'should_remesh', 'include_textures'].includes(field)
          ? ['boolean'] : field === 'timeout_seconds' ? ['number', 'integer'] : ['string'];
        const property = schema.properties?.[field];
        return !toolSchemaAllowsType(property, expected)
          || (field === 'target_formats' && !toolSchemaAllowsType(property.items, ['string']));
      })
      || (schema.required ?? []).some((field) => !fields[role].includes(field))) invalid('official host tool schema is unavailable or incompatible');
    const constants = { response_format: 'json', ...(role === 'create' ? { ai_model: 'meshy-7.1', target_formats: ['glb'] } : {}),
      ...(['status', 'download'].includes(role) ? { task_type: 'text-to-3d' } : {}),
      ...(role === 'status' ? { wait: true, timeout_seconds: 10 } : {}), ...(role === 'download' ? { format: 'glb', include_textures: false } : {}) };
    if (Object.entries(constants).some(([field, value]) => !acceptsToolValue(schema.properties[field], value))) invalid('official tool schema excludes the supported route values');
    schemas[role] = structuredClone(schema);
  }
  return schemas;
}
/** Decode transient MCP content; callers must project allowlisted facts before retention. */
export function officialResult(result) {
  if (result?.isError) invalid('official tool refused the request');
  let value;
  try { value = result?.structuredContent ?? (result?.content?.[0]?.type === 'text' ? JSON.parse(result.content[0].text) : result); }
  catch { invalid('structured official tool result required'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('structured official tool result required');
  return value;
}
export function taskId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) invalid('bounded opaque provider task identifier required');
  return value;
}
export function taskState(value) {
  return ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'].includes(value) ? value : 'UNKNOWN';
}
