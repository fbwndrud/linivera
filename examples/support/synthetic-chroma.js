import { syntheticDeliveryData } from './synthetic-delivery.js';
import { syntheticDependencyContract } from './synthetic-edit.js';

/** Synthetic P0~P4 declarations. Later builders take values read back from retained records. */
export const chromaScope = ['runware', 'minimax', 'generic', 'response-contract', 'provider-image', 'provider-video', 'runware-map', 'minimax-map', 'generic-map',
  'workflow', 'node-contract', 'node-package', 'model', 'workflow-map', 'frame', 'timeline', 'timeline-map', 'cut',
  'project', 'scene', 'db-snapshot', 'environment', 'project-map', 'deliverable',
  'brief', 'rights', 'release', 'performance', 'brief-proof', 'rights-proof', 'release-proof', 'analytics-export', 'brief-map', 'rights-map', 'release-map', 'performance-map',
  'context', 'package', 'next', 'final'];
/** Only refusal cases that reach Input preparation need profile/policy scope. */
export const guardScope = ['context-missing', 'rights-unlinked-map', 'context-unlinked', 'context-undeclared', 'package-unlinked', 'workflow-v1-map', 'context-v1', 'package-v1'];

export function syntheticDownloads() {
  const data = syntheticDeliveryData();
  return { runware: data.runware, minimax: data.minimax, generic: data.generic, 'response-contract': data.contract,
    'db-snapshot': { rows: [{ id: 1, label: 'Synthetic harbor world' }] } };
}
export function syntheticWorkflow(remoteImageId) {
  return { '1': { class_type: 'LoadImage', inputs: { image: `${remoteImageId}.png` } },
    '9': { class_type: 'SyntheticCustom', inputs: { model: 'synthetic.model' } },
    '2': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } } };
}
export const syntheticNodeContract = () => syntheticDependencyContract();
export function syntheticTimeline(frameSeconds) {
  const time = (value) => ({ OTIO_SCHEMA: 'RationalTime.1', value, rate: 24 });
  const clip = (name, duration, target_url) => ({ OTIO_SCHEMA: 'Clip.1', name, source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: time(0), duration: time(duration) },
    media_reference: { OTIO_SCHEMA: 'ExternalReference.1', target_url } });
  return { OTIO_SCHEMA: 'Timeline.1', tracks: { OTIO_SCHEMA: 'Stack.1', children: [{ OTIO_SCHEMA: 'Track.1', children: [
    clip('Synthetic frame', frameSeconds * 24, 'file:///synthetic/frame.png'), clip('Synthetic provider video', 24, 'file:///synthetic/provider.bin')] }] } };
}
export function syntheticProject() {
  return { version: 1, files: [{ path: 'scenes/main.json', role: 'scene', required: true }, { path: 'media/cut.bin', role: 'media', required: true },
    { path: 'db/snapshot.json', role: 'db-snapshot', required: true }, { path: 'environment.json', role: 'environment', required: true }],
  entrypoints: ['scenes/main.json'], dependencies: [{ from: 'scenes/main.json', to: 'media/cut.bin', kind: 'media' }],
  externalStates: [{ id: 'world-db', kind: 'database', required: true, evidence: ['db/snapshot.json'], unavailable: [] },
    { id: 'runtime', kind: 'environment', required: true, evidence: ['environment.json'], unavailable: [] }] };
}
export const syntheticRecords = () => { const { brief, rights, release, performance } = syntheticDeliveryData(); return { brief, rights, release, performance }; };

const map = (format, recordType) => ({ kind: 'structure-map', format, ...(recordType ? { recordType } : {}) });
/** Roles the next task needs; reverse relations become context only when listed here. */
export const nextTaskRequirements = [
  { role: 'deliverable', required: true, accepts: [{ kind: 'deliverable' }] },
  { role: 'provider-response', required: true, accepts: [map('runware-image-response'), map('minimax-video-query'), map('provider-response')] },
  { role: 'workflow', required: true, accepts: [map('comfy-api')] },
  { role: 'edit', required: true, accepts: [map('otio')] },
  { role: 'project', required: true, accepts: [map('project-manifest')] },
  { role: 'brief', required: true, accepts: [map('delivery-record', 'brief')], bindsRole: 'deliverable' },
  { role: 'rights', required: true, accepts: [map('delivery-record', 'rights')], bindsRole: 'deliverable' },
  { role: 'release', required: true, accepts: [map('delivery-record', 'release')], bindsRole: 'deliverable' },
  { role: 'performance', required: false, accepts: [map('delivery-record', 'performance')], bindsRole: 'release' },
];
export function nextTaskContext(roles, { pathId = 'main', scopeId = 'episode-1', override = {} } = {}) {
  const states = Object.entries(roles).flatMap(([role, revisions]) => [revisions].flat().map((revision) => override[role] ?? ({
    role, status: role === 'deliverable' ? 'selected' : 'observed', artifactRevisionId: revision.revisionId, evidenceRevisionIds: [] })));
  return { version: 1, scopeId, pathId, requirements: nextTaskRequirements, states };
}
