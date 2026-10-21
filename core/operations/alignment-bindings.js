import { createResourceStore } from '../resources/revisions.js';
import { fail } from './objects.js';
import { verifyAlignmentBindings } from '../resources/alignment-bindings.js';
/** Timing names exact retained audio and exact source text, never a group label alone. */
export async function verifyGroupAlignments(root, members, request) {
  const store = createResourceStore(root);
  for (const member of members) {
    const envelope = await store.readRevision(member.revisionId);
    if (member.role !== 'alignment' && envelope.kind !== 'audio-alignment') continue;
    if (envelope.mediaType !== 'application/json') fail('ALIGNMENT_BINDING_INVALID', 'typed alignment JSON required');
    const value = JSON.parse((await store.readContent(member.revisionId)).toString('utf8'));
    if (value.normalizedTextRevisionId || value.normalizationMapRevisionId) await verifyAlignmentBindings(root, { version: 1, ...value });
    const audio = members.find((candidate) => candidate.role === 'audio' && candidate.revisionId === value.audioRevisionId);
    const inputAudio = request.inputBindings.find((binding) => ['audio', 'audio_url', 'file'].includes(binding.fieldPath) && binding.revisionId === value.audioRevisionId);
    const text = request.inputBindings.find((binding) => ['text', 'script', 'transcript'].includes(binding.fieldPath) && binding.revisionId === value.textRevisionId);
    if ((!audio && !inputAudio) || !text || !['character', 'word', 'speaker'].includes(value.alignmentKind) || !value.timebase || !['seconds', 'milliseconds', 'frames'].includes(value.timebase.unit)
      || !Number.isFinite(value.timebase.origin) || value.timebase.origin < 0 || (value.timebase.unit === 'frames' && (!Number.isFinite(value.timebase.fps) || value.timebase.fps <= 0))) fail('ALIGNMENT_BINDING_INVALID', 'alignment audio, source text or timebase differs');
    const audioEnvelope = await store.readRevision(value.audioRevisionId);
    if (!audioEnvelope.mediaType.startsWith('audio/')) fail('ALIGNMENT_BINDING_INVALID', 'alignment source must be audio');
    const textEnvelope = await store.readRevision(value.textRevisionId);
    if (textEnvelope.storageStatus !== 'owned_snapshot' || textEnvelope.mediaType !== 'text/plain') fail('ALIGNMENT_BINDING_INVALID', 'retained source transcript required');
    const textContent = (await store.readContent(value.textRevisionId)).toString('utf8');
    if (value.requestText !== undefined && value.requestText !== textContent) fail('ALIGNMENT_BINDING_INVALID', 'alignment text differs from source transcript');
    if (value.original?.text !== undefined && value.original.text !== textContent) fail('ALIGNMENT_BINDING_INVALID', 'original alignment text differs from source transcript');
    const segments = value.segments ?? value.original?.segments ?? value.normalized?.segments;
    if (!Array.isArray(segments) || segments.some((segment) => !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end < segment.start)) fail('ALIGNMENT_BINDING_INVALID', 'ordered timing segments required');
    for (let index = 1; index < segments.length; index++) if (segments[index].start < segments[index - 1].start) fail('ALIGNMENT_BINDING_INVALID', 'timing segments are out of order');
  }
}
