import { ApiError } from './api.js';

const own = (table, key) => (table && key !== null && Object.hasOwn(table, key) ? table[key] : undefined);

/**
 * 내보낸 화면(exports/viewer)의 API 대신: index.html 에 실린 한 벌(folio-data)에서 같은 모양을 꺼낸다.
 * 읽기만 한다 — POST 는 모두 STATIC_EXPORT 로 거부한다. 그림은 내보낸 경로 또는 SVG data URL(assetUrl)로 보여 준다.
 * @param {any} data
 */
export function createStaticApi(data) {
  const missing = (code) => new ApiError(404, code, 'Not included in this exported view');
  function lookup(path) {
    const [, , kind, raw] = String(path).split('/');
    let id = null;
    if (raw !== undefined) { try { id = decodeURIComponent(raw); } catch { throw missing('ROUTE_INVALID'); } }
    const pick = (table, code) => { const value = own(table, id); if (value === undefined) throw missing(code); return value; };
    const whole = (value) => { if (value === null || value === undefined) throw missing('STATIC_UNAVAILABLE'); return value; };
    switch (kind) {
      case 'variants': {
        if (id === null) return data.variants?.catalog ?? { editions: [{ id: 'main', kind: 'original', lang: null }] };
        const edition = id === 'main' ? data : own(data.variants?.editions, id), parts = String(path).split('/');
        if (!edition) throw missing('VARIANT_UNKNOWN');
        let nodeId; try { nodeId = parts[5] ? decodeURIComponent(parts[5]) : null; } catch { throw missing('ROUTE_INVALID'); }
        if (parts[4] === 'nodes' && parts.length === 6 && nodeId) { const value = own(edition.nodes, nodeId); if (!value) throw missing('NODE_NOT_FOUND'); return value; }
        if (parts[4] === 'receipts' && parts.length === 6 && nodeId) { const value = own(edition.receiptNodes, nodeId); if (!value) throw missing('NODE_NOT_FOUND'); return value; }
        if (parts[4] === 'publication' && parts.length === 5) return whole(edition.publication);
        throw missing('ROUTE_UNKNOWN');
      }
      case 'work': return data.work;
      case 'resources': return id === null ? whole(data.resources) : pick(data.resourceDetails, 'RESOURCE_NOT_VISIBLE');
      case 'resource-graph': return whole(data.resourceGraph);
      case 'nodes': return pick(data.nodes, 'NODE_NOT_FOUND');
      case 'entities': return pick(data.entities, 'ENTITY_NOT_FOUND');
      case 'receipts': return id === null ? data.receipts : pick(data.receiptNodes, 'NODE_NOT_FOUND');
      case 'stages': return whole(data.stages);
      case 'check-sets': return whole(data.checkSets);
      case 'impact': return whole(data.impact);
      case 'tracking': return whole(data.tracking);
      case 'publication': return whole(data.publication);
      case 'graph': return data.graph;
      case 'promises': return data.promises;
      case 'blocks': return whole(data.blocks);
      case 'sources': return id === null ? whole(data.sources) : pick(data.sourceDetails, 'SOURCE_NOT_FOUND');
      case 'evidence': return pick(data.evidence, 'NODE_NOT_FOUND');
      default: throw missing('ROUTE_UNKNOWN');
    }
  }
  return {
    static: true,
    get: async (path) => lookup(path),
    post: async () => { throw new ApiError(403, 'STATIC_EXPORT', 'This exported view is read only'); },
    blob: async () => { throw new ApiError(404, 'STATIC_EXPORT', 'This exported view uses image file paths'); },
    assetUrl: (id) => own(data.assetFiles, id) ?? null,
  };
}

/** 문서에 실린 한 벌. 없거나 읽을 수 없으면 null(살아 있는 뷰어 서버). */
export function readStaticData(doc) {
  const element = doc?.getElementById?.('folio-data');
  if (!element) return null;
  try { return JSON.parse(element.textContent ?? ''); } catch { return null; }
}
