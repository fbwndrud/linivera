/** Declared data family, never a claim that a native project was decoded or restored. */
export function resourceFamily(revision) {
  if (revision.kind === 'artifact-bundle') return 'bundle';
  if (['context-package', 'usage-context', 'resource-usage'].includes(revision.kind)) return 'context';
  if (revision.kind === 'iteration') return 'iteration';
  if (revision.kind === 'session-record') return 'session';
  if (revision.kind === 'audio-alignment') return 'alignment';
  const type = revision.mediaType ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('model/')) return 'model';
  if (/javascript|typescript|wasm/.test(type) || /source|build|code/.test(revision.kind)) return 'code';
  if (/workflow|graph/.test(revision.kind)) return 'workflow';
  if (type === 'text/plain') return 'text';
  if (type === 'application/json') return 'data';
  return 'file';
}
