import { FolioError } from '../errors.js';
import { viewWorkspaceMode } from './workspace-mode.js';
import { readResourceSnapshot } from './resources.js';
import { readResourceGraph } from '../query/resource-graph.js';
import { withResourceViewCheckpoint } from './resource-checkpoint.js';
import { assertFeature } from '../work/features.js';
import { viewOutline } from './outline.js';
import { trackingReadView } from './tracking-view.js';
import { writingReadContext } from './read-context.js';
import { assertWritingCheckpoint } from './writing-checkpoint.js';
import { impactReadView } from './impact-view.js';
import { viewPublication } from './publication-view.js';
import { viewNode } from './node-view.js';
import { viewEntity } from './entity-view.js';
import { viewNodeReceipts, viewReceiptList } from './receipt-view.js';
import { viewStages } from './stages-view.js';
import { viewGraph } from './graph-view.js';
import { viewPromiseBoard } from './promise-board.js';
import { viewCheckSets } from './check-sets-view.js';
import { viewNodeEvidence, viewSource, viewSources } from './evidence-view.js';
import { viewBlocks } from './blocks-view.js';

import { variantSnapshot } from './variant-view.js';

export const SNAPSHOT_VERSION = 1;

/** 설정 때문에 못 여는 화면은 빈칸(null)으로 둔다. 그 밖의 오류는 그대로 던진다. */
async function optional(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FolioError) return null;
    throw error;
  }
}

/** @param {string[]} ids @param {(id: string) => Promise<unknown>} fn */
async function each(ids, fn) {
  const out = {};
  for (const id of ids) out[id] = await fn(id);
  return out;
}

/**
 * 정적 내보내기용 한 벌: 뷰어 API 가 돌려주는 값을 화면마다 모두 모은다(같은 core/view 함수, 같은 모양).
 * 내보낸 화면은 읽기만 한다 — 단계 토글은 끈 것으로 싣는다. viewerExport 기능이 꺼져 있으면 FEATURE_DISABLED.
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 */
export async function buildSnapshot(root, { packs }) {
  return withResourceViewCheckpoint(root, async (state) => {
    const workspace = await viewWorkspaceMode(root);
    if (workspace.mode === 'writing') assertFeature(workspace.config, 'viewerExport');
    const resources = await readResourceSnapshot(root, state);
    resources.resourceGraph = await readResourceGraph(root, {}, state);
    if (workspace.mode === 'resources') return { version: SNAPSHOT_VERSION, work: await viewOutline(root, { packs }),
      nodes: {}, entities: {}, receipts: null, receiptNodes: {}, stages: null, checkSets: null, graph: null, promises: null,
      blocks: null, sources: null, sourceDetails: {}, evidence: {}, ...resources };
    return writingSnapshot(root, packs, workspace.config, resources);
  });
}

async function writingSnapshot(root, packs, config, resources) {
  const context = await writingReadContext(root, packs);
  const work = await viewOutline(root, { packs });
  const nodeIds = work.nodes.map((n) => n.id);
  const stages = await optional(() => viewStages(root, { packs }));
  const sources = config.features.sources ? await viewSources(root, context) : null;
  const tracking = trackingReadView(context.work);
  const result = {
    version: SNAPSHOT_VERSION,
    variants: await variantSnapshot(context, root, packs),
    ...resources,
    work: { ...work, capabilities: { ...work.capabilities, viewerToggles: false }, features: { ...work.features, viewerToggles: false } },
    nodes: await each(nodeIds, (id) => viewNode(root, id, context)),
    entities: await each(work.entities.map((e) => e.id), (id) => viewEntity(root, id, context)),
    receipts: await viewReceiptList(root, { packs }, context),
    receiptNodes: await each(nodeIds, (id) => viewNodeReceipts(root, { packs }, id, context)),
    stages: stages ? { ...stages, toggles: false } : null,
    checkSets: await optional(() => viewCheckSets(root, { packs })),
    graph: await viewGraph(root),
    tracking,
    impact: impactReadView(context, resources.resources),
    publication: await optional(() => viewPublication(root)),
    promises: await viewPromiseBoard(root),
    blocks: await optional(() => viewBlocks(root)),
    sources,
    sourceDetails: sources ? await each(sources.sources.map((s) => s.id), (id) => viewSource(root, id, context)) : {},
    evidence: await each(nodeIds, (id) => viewNodeEvidence(root, id, context)),
  };
  await assertWritingCheckpoint(root, context.checkpoint);
  if (Object.entries(result.nodes).some(([id, node]) => node.contentHash !== tracking.sources[id]?.contentHash)) {
    throw new FolioError('VIEW_CHANGED', 'writing sources changed during export; retry the view');
  }
  return result;
}

/** 한 벌이 가리키는 그림 id(읽기 화면의 본문·붙은 그림, 엔티티의 관련 그림). */
export function snapshotAssetIds(snapshot) {
  const ids = new Set();
  for (const node of [...Object.values(snapshot.nodes), ...Object.values(snapshot.variants?.editions ?? {}).flatMap(e => Object.values(e.nodes))]) for (const a of [...node.assets.inline, ...node.assets.attached]) if (a.hasFile) ids.add(a.id);
  for (const entity of Object.values(snapshot.entities)) for (const a of entity.assets) if (a.hasFile) ids.add(a.id);
  return [...ids].sort();
}
