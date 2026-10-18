import { FolioError } from '../errors.js';

/** 적용 범위와 실제 사용 위치(attach)는 다르다. 생략한 옛 자산은 공통 참조다. */
export const assetAllowsNode = (asset, nodeId) => !asset.managed || !asset.brief?.scope || asset.brief.scope.nodeIds.includes(nodeId);

export function assertAssetScope(asset, nodeIds) {
  const outside = nodeIds.filter((id) => !assetAllowsNode(asset, id));
  if (outside.length) throw new FolioError('ASSET_SCOPE_MISMATCH', asset.id, { nodeIds: outside });
}
