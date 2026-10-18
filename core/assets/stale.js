import { gatherScope } from '../scope/scope.js';

/** 관리 자산의 변경·새 연결·연결 해제는 최신 원고 재검사에 묶는다. 기존 다른 ref의 판정은 그대로 둔다. */
export function managedAssetReasons({ work, events, node, receipt, recheck, marks = null }) {
  const refs = recheck?.refs ?? receipt.refs ?? [];
  const before = new Map(refs.filter((r) => r.kind === 'asset' && work.assets.get(r.id)?.managed).map((r) => [r.id, r.rev]));
  // 추출 때만 등장한 인물도 영수증의 범위에 남는다. 본문 문자열 재검색만으로 그 자산을 잃지 않는다.
  const extracted = { appearances: refs.filter((r) => r.kind === 'entity').map((r) => r.id) };
  let scope;
  try { scope = gatherScope({ work, events, nodeId: node.id, draftText: node.body, extracted, marks }); }
  catch (error) {
    if (error?.code !== 'ASSET_SCOPE_MISMATCH') throw error;
    const id = error.details.assetId;
    return [{ kind: 'asset', id, code: error.code, was: before.get(id) ?? null, now: work.assets.get(id)?.rev ?? null }];
  }
  const now = new Map(scope.assets.filter((a) => a.managed).map((a) => [a.id, a.rev]));
  return [...new Set([...before.keys(), ...now.keys()])].filter((id) => (before.get(id) ?? null) !== (now.get(id) ?? null))
    .map((id) => ({ kind: 'asset', id, was: before.get(id) ?? null, now: now.get(id) ?? null }));
}
