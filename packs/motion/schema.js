import { FolioError } from '../../core/errors.js';
import { assertResourceId, assertRevisionId } from '../../core/resources/schema.js';
export function invalid(message) { throw new FolioError('MOTION_SPEC_INVALID', message); }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) invalid('unsupported motion fields');
}
function number(value, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid('motion number outside supported range');
}
export function outputSettings(spec) {
  if (spec.version !== 1) invalid('motion version 1 required');
  assertResourceId(spec.outputResourceId);
  if (spec.outputResourceId.length > 80) invalid('outputResourceId exceeds 80 characters');
  number(spec.width, 16, 1920, true); number(spec.height, 16, 1920, true); number(spec.fps, 1, 60, true);
  if (spec.width % 2 || spec.height % 2) invalid('even dimensions required for MP4');
}
export function audioSettings(audio) {
  if (!Array.isArray(audio) || audio.length > 8) invalid('up to eight audio tracks supported');
  for (const track of audio) {
    object(track, ['role', 'revisionId', 'required', 'startSeconds', 'gain']);
    if (!['voice', 'music', 'sfx'].includes(track.role) || typeof track.required !== 'boolean') invalid('audio role and required flag required');
    if (track.revisionId !== null) assertRevisionId(track.revisionId);
    number(track.startSeconds ?? 0, 0, 120); number(track.gain ?? 1, 0, 4);
  }
}
export function validateProject(spec) {
  object(spec, ['version', 'outputResourceId', 'width', 'height', 'fps', 'shots', 'audio']); outputSettings(spec);
  audioSettings(spec.audio);
  if (!Array.isArray(spec.shots) || spec.shots.length < 1 || spec.shots.length > 20) invalid('one to twenty shots required');
  let duration = 0;
  for (const shot of spec.shots) {
    object(shot, ['durationSeconds', 'backgroundColor', 'layers']);
    number(shot.durationSeconds, 0.25, 120); duration += shot.durationSeconds;
    if (typeof shot.backgroundColor !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(shot.backgroundColor)) invalid('six-digit background color required');
    if (!Array.isArray(shot.layers) || shot.layers.length > 8) invalid('up to eight layers supported per shot');
    for (const layer of shot.layers) {
      object(layer, ['revisionId', 'x', 'y', 'width', 'dx', 'dy', 'bob']); assertRevisionId(layer.revisionId);
      number(layer.x, -3840, 3840); number(layer.y, -3840, 3840); number(layer.width, 1, 3840, true);
      number(layer.dx ?? 0, -3840, 3840); number(layer.dy ?? 0, -3840, 3840); number(layer.bob ?? 0, 0, 1920);
    }
  }
  number(duration, 1, 120); return spec;
}
export function validateTimeline(spec) {
  object(spec, ['version', 'outputResourceId', 'width', 'height', 'fps', 'shots', 'audio', 'renderer']); outputSettings(spec); audioSettings(spec.audio);
  if (spec.renderer !== 'folio.ffmpeg.cutout.v1' || !Array.isArray(spec.shots) || !spec.shots.length || spec.shots.length > 20) invalid('unsupported compiled timeline');
  let duration = 0;
  for (const shot of spec.shots) { object(shot, ['revisionId', 'durationSeconds']); assertRevisionId(shot.revisionId); number(shot.durationSeconds, 0.25, 120); duration += shot.durationSeconds; }
  number(duration, 1, 120); return spec;
}
