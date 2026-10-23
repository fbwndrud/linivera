import { MESHY_TOOL_CONTRACT, MESHY_INSTALLATION_EVIDENCE } from '../../server/production/official-tools.js';

/** Synthetic official-host boundary only: no provider calls, installation or account credentials. */
export function syntheticOfficialTools({ bytes = Buffer.from('synthetic model bytes'), missingTool, balance = 100,
  state = {}, downloadFailures = 0, urlOnly = false, wrongSize = false, rawSecret = 'SYNTHETIC-HOST-SECRET' } = {}) {
  const counters = { list: 0, balance: 0, create: 0, status: 0, download: 0, capture: 0 };
  const calls = []; let prompt;
  const fieldSets = { create: ['prompt', 'ai_model', 'target_formats', 'should_remesh', 'response_format'],
    status: ['task_id', 'task_type', 'wait', 'timeout_seconds', 'response_format'],
    download: ['task_id', 'task_type', 'format', 'include_textures', 'save_to', 'response_format'], balance: ['response_format'] };
  const definitions = Object.entries(MESHY_TOOL_CONTRACT.tools).map(([role, name]) => ({ name,
    inputSchema: { type: 'object', required: role === 'create' ? ['prompt'] : ['status', 'download'].includes(role) ? ['task_id'] : [],
      properties: Object.fromEntries(fieldSets[role].map((field) => [field, { type: field === 'target_formats' ? 'array' : ['should_remesh', 'wait', 'include_textures'].includes(field) ? 'boolean' : field === 'timeout_seconds' ? 'number' : 'string', ...(field === 'target_formats' ? { items: { type: 'string' } } : {}) }])) } }));
  const fail = () => { throw new Error(`Authorization: Bearer ${rawSecret}`); };
  const envelope = (value) => ({ structuredContent: { ...value, api_key: rawSecret,
    headers: { Authorization: `Bearer ${rawSecret}` }, unexpected_prose: rawSecret } });
  return {
    counters, calls, get prompt() { return prompt; },
    async probe() {
      return ['installation', 'exposure', 'authentication', 'permission', 'plan', 'credits'].map((kind) => ({ kind,
        status: state[kind] ?? 'passed', basis: 'synthetic-fixture',
        reasonCode: state[kind] === 'expired' ? 'expired' : state[kind] === 'unknown' ? 'not-checked'
          : state[kind] === 'blocked' ? ({ authentication: 'not-authenticated', permission: 'permission-denied', plan: 'plan-required', credits: 'credits-insufficient' })[kind] ?? 'not-exposed' : 'verified',
        raw_secret: rawSecret,
      }));
    },
    tools: {
      async list() { counters.list++; return { tools: definitions.filter((tool) => tool.name !== missingTool),
        installationEvidence: { ...MESHY_INSTALLATION_EVIDENCE }, raw_secret: rawSecret }; },
      async call(name, args) {
        const role = Object.entries(MESHY_TOOL_CONTRACT.tools).find(([, tool]) => tool === name)?.[0];
        if (!role) fail(); counters[role]++; calls.push({ role, args: structuredClone(args) });
        if (state.authentication === 'blocked') fail();
        if (role === 'balance') return envelope({ balance });
        if (role === 'create') {
          if (['permission', 'plan', 'credits'].some((kind) => state[kind] && state[kind] !== 'passed')) fail();
          prompt = args.prompt; return envelope({ task_id: 'synthetic-official-task', status: 'PENDING' });
        }
        if (role === 'status') return envelope({ task_id: args.task_id, task_type: 'text-to-3d', status: 'SUCCEEDED',
          model_urls: { glb: `https://example.invalid/model?signature=${rawSecret}` } });
        if (downloadFailures-- > 0) fail();
        if (urlOnly) return envelope({ download_url: `https://example.invalid/model?signature=${rawSecret}` });
        return envelope({ local_path: args.save_to, file_size_bytes: bytes.byteLength + Number(wrongSize), format: args.format,
          download_url: `https://example.invalid/model?signature=${rawSecret}` });
      },
      async download(_descriptor) { counters.capture++; return Buffer.from(bytes); },
    },
  };
}
