import { planMotion, renderMotion, compileMotion, assembleMotion } from '../../packs/motion/index.js';
import { ffmpegMotion } from '../../adapters/motion/ffmpeg.js';
import { ID, actor, definition, argsFor, rule } from './resource-schema.js';
export const motionDefinition = definition('folio_motion', 'Create pose/layer motion using shared selected resources and local FFmpeg. plan reports required missing media; render submits each shot as a common candidate. Review/select shots using existing tools, then compile from the project, original inputs and selected shots. Review/select the compiled timeline; assemble from that timeline, its selected shots and optional audio. Each stage pins exact revisions in a separate common Operation. Never approves/selects by itself. actor:user conveys an actual user instruction; host needs a valid grant. No model/network generation. Maximum 120 seconds, 1920px and 8MiB per resource.', ['plan', 'render', 'compile', 'assemble'], {
  inputSnapshotId: ID, idempotencyKey: { ...ID, maxLength: 256 }, actor, grantId: ID,
});
const rules = { plan: rule(['inputSnapshotId']), ...Object.fromEntries(['render', 'compile', 'assemble'].map((op) => [op, rule(['inputSnapshotId', 'idempotencyKey', 'actor'], ['grantId'])])) };
export function motionTool(root, input) {
  const { op, values } = argsFor(input, rules);
  return { plan: planMotion, render: renderMotion, compile: compileMotion, assemble: assembleMotion }[op](root, values, ffmpegMotion);
}
