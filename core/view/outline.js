import { viewWorkspaceMode, workspaceCapabilities, workspaceScreens } from './workspace-mode.js';
import { FolioError } from '../errors.js';
import { openWork } from '../store/work.js';
import { preorder } from '../store/tree.js';
import { workStatus } from '../status.js';
import { MAIN, variantOf } from '../variants/model.js';

/**
 * 상태 요약. 설정이 틀려 작품을 열 수 없으면(CONFIG_INVALID 등) 읽기 화면은 그대로 두고 오류 코드만 싣는다.
 * @param {string} root
 * @param {Map<string, any>} packs
 */
async function statusSummary(root, packs) {
  try {
    const status = await workStatus(root, { packs });
    return {
      ok: true,
      ledger: status.ledger,
      next: status.next,
      activeRun: status.activeRun,
      stale: status.stale.map((s) => s.nodeId),
      recheck: status.recheck.map((r) => r.nodeId),
      flagged: status.flagged.map((f) => f.nodeId),
      drift: status.drift.filter((d) => variantOf(d) === MAIN).map((d) => ({ nodeId: d.nodeId, code: d.code })),
      warnings: status.warnings.map((w) => w.code),
    };
  } catch (error) {
    if (error instanceof FolioError) return { ok: false, error: { code: error.code } };
    throw error;
  }
}

/**
 * 뷰어 뼈대: 작품 제목·레벨, 읽는 순서의 노드 목차, 엔티티 목록, 상태 요약. 읽기만 한다.
 * @param {string} root
 * @param {{ packs: Map<string, any> }} options
 */
export async function viewOutline(root, { packs }) {
  const workspace = await viewWorkspaceMode(root);
  const capabilities = workspaceCapabilities(workspace.mode, workspace.config);
  if (workspace.mode === 'resources') return { title: workspace.title, mode: workspace.mode, capabilities, availableScreens: ['resources', 'graph'],
    levels: [], features: { viewerToggles: false }, nodes: [], entities: [], status: { ok: true } };
  const work = await openWork(root);
  const nodes = preorder(work.tree).map((id) => {
    const node = work.tree.nodes.get(id);
    const position = work.positions.get(id);
    return {
      id, level: node.level, kind: node.kind, role: node.role, status: node.status, title: node.title,
      parentId: node.parentId, children: [...node.children], ordinal: position.ordinal, ordered: position.ordered,
      hasBody: node.body.trim().length > 0,
    };
  });
  return {
    title: work.config.title, mode: 'writing', capabilities, availableScreens: workspaceScreens(work.config),
    levels: work.config.levels.map((level) => ({ name: level.name, leaf: level.leaf })),
    features: { viewerToggles: work.config.features.viewerToggles },
    nodes,
    entities: [...work.entities.values()].map((entity) => ({ id: entity.id, kind: entity.kind, name: entity.name })),
    status: await statusSummary(root, packs),
  };
}
