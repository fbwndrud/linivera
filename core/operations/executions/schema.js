import { fail } from '../objects.js';
const TYPES = ['prepared', 'submitting', 'accepted', 'running', 'outputs-observed', 'complete', 'submission-unknown', 'failed', 'canceled', 'partial', 'group-discovered'];
export function validateExecutionEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || !TYPES.includes(event.type)
    || Object.keys(event).some((key) => !['type', 'requestDigest', 'nativeRecordRevisionId', 'remoteInputBindings', 'artifacts', 'providerJobId', 'providerRunId', 'nativeStatus', 'reportedCost', 'unavailableFields', 'observation', 'groupId', 'nativeKey', 'kind', 'omittedPaths', 'error', 'enumerationComplete'].includes(key))
    || (event.observation !== undefined && event.observation !== 'host-reported')) fail('EXECUTION_INVALID', 'unsupported execution observation');
  for (const key of ['providerJobId', 'providerRunId', 'nativeStatus']) if (event[key] !== undefined && (typeof event[key] !== 'string' || !event[key].length || event[key].length > 4096)) fail('EXECUTION_INVALID', `invalid ${key}`);
  for (const key of ['unavailableFields', 'omittedPaths']) if (event[key] !== undefined && (!Array.isArray(event[key]) || event[key].some((value) => typeof value !== 'string'))) fail('EXECUTION_INVALID', `invalid ${key}`);
  if (event.artifacts !== undefined && (event.type !== 'outputs-observed' || !Array.isArray(event.artifacts) || !event.artifacts.length || event.artifacts.length > 4096)) fail('EXECUTION_INVALID', 'artifacts require an output observation');
  if (event.type === 'outputs-observed' && !event.artifacts?.length) fail('EXECUTION_INVALID', 'output observation needs artifacts');
  if (event.type === 'prepared' && (!event.requestDigest || !event.nativeRecordRevisionId || !Array.isArray(event.remoteInputBindings))) fail('EXECUTION_INVALID', 'prepared input must bind native request and mappings');
  return event;
}
export function assertTransition(previous, type) {
  const allowed = {
    prepared: [undefined], submitting: ['prepared'], accepted: ['submitting', 'submission-unknown'], running: ['accepted', 'running'],
    'submission-unknown': ['submitting'], 'group-discovered': ['accepted', 'running', 'outputs-observed', 'partial'],
    'outputs-observed': ['accepted', 'running', 'outputs-observed', 'partial', 'failed', 'canceled', 'complete'],
    complete: ['accepted', 'running', 'outputs-observed', 'partial'], partial: ['accepted', 'running', 'outputs-observed', 'failed', 'partial'],
    failed: ['prepared', 'submitting', 'accepted', 'running', 'outputs-observed', 'partial', 'submission-unknown'],
    canceled: ['prepared', 'submitting', 'accepted', 'running', 'outputs-observed', 'partial', 'submission-unknown'],
  };
  if (!allowed[type]?.includes(previous)) fail('EXECUTION_TRANSITION_INVALID', 'execution cannot make this transition');
}
