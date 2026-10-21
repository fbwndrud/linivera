import { FolioError } from '../../core/errors.js';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

const textFields = new Set(['prompt', 'text', 'previous_text', 'next_text']);
function invalid(message) { throw new FolioError('PRODUCTION_INPUT_BINDING_INVALID', message); }

/** Verify caller-supplied pinned bytes against the authoritative public MCP resources. */
export async function verifyPreparedBindings({ invoke, prepared, inspected }) {
  const sealed = await invoke('folio_resources', { op: 'read', revisionId: inspected.requestRevisionId });
  if (canonicalJson(JSON.parse(sealed.content)) !== canonicalJson(prepared.request)) invalid('prepared request differs from the sealed generation request');
  const current = inspected.executions.find((item) => item.executionId === inspected.selectedExecutionId);
  const mappings = prepared.inputMapping.map(({ fieldPath, revisionId }) => ({ fieldPath, revisionId }));
  const signature = (values) => canonicalJson([...values].sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)));
  if (current && signature(current.remoteInputBindings) !== signature(mappings)) invalid('prepared mappings differ from durable input bindings');
  for (const binding of mappings) {
    if (!textFields.has(binding.fieldPath)) {
      if (['fal', 'elevenlabs'].includes(prepared.request.provider)) invalid('unsupported provider input binding');
      continue;
    }
    const source = await invoke('folio_resources', { op: 'read', revisionId: binding.revisionId });
    const payload = prepared.nativeRequest.input ?? prepared.nativeRequest.body;
    if (source.revision.mediaType !== 'text/plain' || typeof source.content !== 'string'
      || sha256(Buffer.from(source.content, 'utf8')) !== source.revision.contentHash
      || prepared.request.parameters[binding.fieldPath] !== source.content
      || payload?.[binding.fieldPath] !== source.content) invalid('native text must equal the actual sealed input revision bytes');
  }
}
