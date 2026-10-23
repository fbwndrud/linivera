import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolioError } from '../../core/errors.js';
import { MAX_RESOURCE_BYTES } from '../../core/resources/schema.js';
import { shotFilters, assemblyFilters } from './filters.js';
const exec = promisify(execFile);
async function command(binary, args) {
  try { return await exec(binary, args, { timeout: 90000, maxBuffer: 1024 * 1024, shell: false }); }
  catch (error) { throw new FolioError(error.code === 'ENOENT' ? 'MOTION_RENDERER_UNAVAILABLE' : 'MOTION_RENDER_FAILED', `${binary}: ${error.code === 'ENOENT' ? 'install local FFmpeg and ffprobe' : String(error.stderr ?? error.message).slice(-1500)}`); }
}
async function output(directory, args, spec, duration, audio) {
  const target = join(directory, 'result.mp4');
  await command('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-filter_complex_threads', '1', ...args,
    '-t', String(duration), '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p',
    ...(audio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']), '-map_metadata', '-1', '-movflags', '+faststart', '-fs', String(MAX_RESOURCE_BYTES + 1), target]);
  if ((await stat(target)).size > MAX_RESOURCE_BYTES) throw new FolioError('RESOURCE_TOO_LARGE', 'render exceeds 8MiB; shorten the clip or reduce resolution');
  const probe = JSON.parse((await command('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-f', 'mov', '-show_streams', '-show_format', '-of', 'json', target])).stdout);
  const video = probe.streams.find((s) => s.codec_type === 'video'); const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
  const observedDuration = Number(probe.format.duration);
  if (!video || video.width !== spec.width || video.height !== spec.height || Math.abs(observedDuration - duration) > Math.max(0.2, 1 / spec.fps) || hasAudio !== audio) throw new FolioError('MOTION_RENDER_INVALID', 'rendered technical properties differ from the plan');
  return { bytes: await readFile(target), technical: { renderer: 'folio.ffmpeg.cutout.v1', width: video.width, height: video.height, durationSeconds: observedDuration, audio: hasAudio, observation: 'local-ffprobe' } };
}
async function scratch(run) { const directory = await mkdtemp(join(tmpdir(), 'folio-render-')); try { return await run(directory); } finally { await rm(directory, { recursive: true, force: true }); } }
export const ffmpegMotion = {
  renderShot: (spec) => scratch(async (directory) => {
    const args = ['-f', 'lavfi', '-i', `color=c=0x${spec.backgroundColor.slice(1)}:s=${spec.width}x${spec.height}:r=${spec.fps}:d=${spec.durationSeconds}`];
    for (const [i, layer] of spec.layers.entries()) { const path = join(directory, `layer-${i}.image`); await writeFile(path, layer.bytes); args.push('-protocol_whitelist', 'file', '-f', 'image2', '-pattern_type', 'none', '-loop', '1', '-framerate', String(spec.fps), '-i', path); }
    args.push('-filter_complex', shotFilters(spec), '-map', '[out]'); return output(directory, args, spec, spec.durationSeconds, false);
  }),
  assemble: (spec) => scratch(async (directory) => {
    const args = [];
    for (const [i, item] of [...spec.shots, ...spec.audio].entries()) {
      const path = join(directory, `input-${i}.media`); await writeFile(path, item.bytes);
      const format = i < spec.shots.length ? 'mov' : { 'audio/wav': 'wav', 'audio/mpeg': 'mp3' }[item.mediaType];
      if (!format) throw new FolioError('MOTION_INPUT_INVALID', 'supported declared audio media type required');
      args.push('-protocol_whitelist', 'file', '-f', format, ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path);
    }
    args.push('-filter_complex', assemblyFilters(spec), '-map', '[out]'); if (spec.audio.length) args.push('-map', '[audio]');
    return output(directory, args, spec, spec.shots.reduce((n, s) => n + s.durationSeconds, 0), spec.audio.length > 0);
  }),
};
