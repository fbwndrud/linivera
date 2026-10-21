import { FolioError } from '../../core/errors.js';

/** Retain observed files first; bind timing metadata to exact retained audio/text. */
export async function retainProductionArtifacts({ invoke, json, prepared, collection, priorArtifacts = [] }) {
  if (!Array.isArray(collection.artifacts) || !collection.artifacts.length) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'observed artifacts required');
  const retained = [];
  const ordered = [...collection.artifacts].sort((a, b) => Number(Boolean(a.metadata?.sourceArtifactKey)) - Number(Boolean(b.metadata?.sourceArtifactKey)));
  for (const artifact of ordered) {
    let revision;
    if (artifact.metadata?.sourceArtifactKey) {
      const audio = [...retained, ...priorArtifacts].find((item) => item.artifactKey === artifact.metadata.sourceArtifactKey && item.groupId === artifact.groupId);
      const binding = prepared.request.inputBindings.find((item) => item.fieldPath === 'text');
      if (!audio || audio.role !== 'audio' || !binding || (artifact.metadata.textRevisionId && artifact.metadata.textRevisionId !== binding.revisionId)) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'alignment must bind exact observed audio and pinned text');
      const timing = JSON.parse(Buffer.from(artifact.bytes).toString('utf8'));
      revision = await json(artifact.resourceId, { ...timing, version: 1, audioRevisionId: audio.revisionId, textRevisionId: binding.revisionId,
        alignmentKind: 'character', timebase: { unit: 'seconds', origin: 0 } }, 'audio-alignment');
    } else if (artifact.path) {
      revision = await invoke('folio_resources', { op: 'importFile', resourceId: artifact.resourceId, kind: 'production-artifact',
        path: artifact.path, mediaType: artifact.mediaType, ...(artifact.contentHash ? { contentHash: artifact.contentHash } : {}) });
    } else {
      revision = await invoke('folio_resources', { op: 'propose', resourceId: artifact.resourceId, kind: 'production-artifact',
        owned: { base64: Buffer.from(artifact.bytes).toString('base64'), mediaType: artifact.mediaType } });
    }
    retained.push({ artifactKey: artifact.artifactKey, groupId: artifact.groupId, role: artifact.role, ...revision });
  }
  return retained;
}
