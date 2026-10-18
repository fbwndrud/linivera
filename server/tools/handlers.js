import { loreCommand } from '../../core/lore/commands.js';
import { interviewCommand } from '../../core/interview/commands.js';
import { embeddingsTool } from './embeddings.js';
import { resourcesTool } from './resources.js';
import { inputsTool } from './inputs.js';
import { policyTool } from './policy.js';
import { operationsTool } from './operations.js';
import { resourceQueryTool } from './resource-query.js';
import { OPERATION_ARGUMENTS } from './input-contracts.js';
import { FolioError } from '../../core/errors.js';
import { createRunner } from '../../core/run/runner.js';
import { exportWork, checkExport } from '../../core/export/export-work.js';
import { createRunStore } from '../../core/run/run-store.js';
import { outcomeFromPending } from '../../core/run/steps/common.js';
import { changeStructure } from '../../core/structure/locked.js';
import { workStatus } from '../../core/status.js';
import { initWork } from '../../core/work/init.js';
import { importVibelore } from '../../core/import/import-work.js';
import { findInWork } from './find.js';
import { occurrencesTool } from './occurrences.js';
import { sourcesTool } from './sources.js';
import { assetsTool } from './assets.js';
import { trackingTool } from './tracking.js';
import { imageTool } from './image.js';
import { describeConfig } from './config.js';
import { createViewerRegistry } from '../view/registry.js';

const STRUCTURE_ARGS = OPERATION_ARGUMENTS.folio_structure;

function structureArgs(op, args) {
  const rule = STRUCTURE_ARGS[op];
  const missing = rule.required.filter((key) => args[key] === undefined);
  const extra = Object.keys(args).filter((key) => !rule.allowed.includes(key));
  if (missing.length || extra.length) throw new FolioError('STRUCTURE_ARGS_INVALID', `${op}: missing ${missing.join(',') || '-'}, not allowed ${extra.join(',') || '-'}`, { op, missing, extra });
  return args;
}

/**
 * 도구 이름 → 처리 함수. 실행기(run/resume/decide), changeStructure, initWork, importVibelore, 읽기 함수를 부른다.
 * 커밋 함수·구조 함수·기록장·트리 쓰기를 직접 부르지 않는다(test/server/tools.test.js 가드).
 * folio_view 는 작품마다 로컬 뷰어 서버를 하나 띄운다(server/view). 뷰어는 core/view 만 부른다.
 * @param {{ packs: Map<string, any>, viewer?: ReturnType<typeof createViewerRegistry> }} options
 */
export function createHandlers({ packs, viewer = createViewerRegistry({ packs }) }) {
  const runner = (root) => createRunner({ root, packs });
  return {
    folio_lore: ({ root, ...args }) => loreCommand(root, args),
    folio_interview: ({ root, ...args }) => interviewCommand(root, args),
    folio_embeddings: ({ root, ...args }) => embeddingsTool(root, args),
    folio_resources: ({ root, ...args }) => resourcesTool(root, args),
    folio_inputs: ({ root, ...args }) => inputsTool(root, args),
    folio_policy: ({ root, ...args }) => policyTool(root, args),
    folio_operations: ({ root, ...args }) => operationsTool(root, args),
    folio_resource_query: ({ root, ...args }) => resourceQueryTool(root, args),
    folio_init: ({ root, title, preset, packs: names = ['novel'], features, language }) => initWork(root, { title, preset, packs: names, available: packs, features, language }),
    folio_status: async ({ root }) => {
      const status = await workStatus(root, { packs });
      const pending = status.activeRun ? outcomeFromPending(await createRunStore(root).load(status.activeRun.runId)) : null;
      return { ...status, pending };
    },
    folio_run: ({ root, node = 'next', mode = 'normal', variant = 'main' }) => runner(root).run({ node, mode, variant }),
    folio_resume: ({ root, runId, answers }) => runner(root).resume({ runId, answers }),
    folio_decide: ({ root, runId, action, feedback = '', reason = '' }) => runner(root).decide({ runId, action, feedback, reason }),
    folio_structure: ({ root, op, ...args }) => changeStructure(root, { op, ...structureArgs(op, args) }),
    folio_find: ({ root, query, id, kind, newName, keepOldName, include, exclude }) => findInWork(root, { query, id, kind, newName, keepOldName, include, exclude }),
    folio_view: ({ root, nodeId }) => viewer.open(root, { nodeId }),
    folio_occurrences: ({ root, op, ...args }) => occurrencesTool(root, { op, ...args }),
    folio_sources: ({ root, op, ...args }) => sourcesTool(root, { op, ...args }),
    folio_assets: ({ root, op, ...args }) => assetsTool(root, { op, ...args }),
    folio_tracking: ({ root, ...args }) => trackingTool(root, args),
    folio_config: ({ root, checkDraft, workKind, node }) => describeConfig(root, { packs, checkDraft, workKind, node }),
    folio_image: ({ root, op, ...args }) => imageTool(root, packs, { op, ...args }),
    folio_import_vibelore: ({ root, from, title }) => importVibelore(root, { from, title, packs }),
    folio_export: ({ root, op = 'export', format = 'web', variant = 'main', language = null, output }) => op === 'check'
      ? checkExport({ root, format, variant, language }) : exportWork({ root, format, variant, language, output }),
  };
}
