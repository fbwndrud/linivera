import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { useLoad } from '../api-context.jsx';
import { LoadState } from './Status.jsx';
const elk = new ELK();
const label = (n) => n.type === 'operation' ? `Production · ${n.status}` : `${n.resourceId} · ${n.states.join(', ')}${n.reviewRequired ? ' · Review needed' : ''}`;

export function ResourceLineage() {
  const [state, reload] = useLoad('/api/resource-graph');
  if (!state.data) return <LoadState state={state} />;
  return <ResourceLineageContent data={state.data} reload={reload} />;
}

export function ResourceLineageContent({ data, reload }) {
  const [positions, setPositions] = useState(new Map()); const [selected, select] = useState(null);
  const [focus, setFocus] = useState('');
  useEffect(() => {
    let alive = true;
    elk.layout({ id: 'resources', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
      children: data.nodes.map((n) => ({ id: n.id, width: 220, height: 64 })),
      edges: data.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })) })
      .then((graph) => { if (alive) setPositions(new Map(graph.children.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))); }, () => {});
    return () => { alive = false; };
  }, [data]);
  const visible = useMemo(() => {
    if (!focus) return new Set(data.nodes.map((n) => n.id));
    const ids = new Set(data.nodes.filter((n) => n.resourceId === focus).map((n) => n.id));
    for (let changed = true; changed;) {
      changed = false;
      for (const e of data.edges) if (ids.has(e.source) || ids.has(e.target)) for (const id of [e.source, e.target]) if (!ids.has(id)) { ids.add(id); changed = true; }
    }
    return ids;
  }, [data, focus]);
  const nodes = data.nodes.filter((n) => visible.has(n.id)).map((n) => ({ id: n.id, position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { label: label(n) }, style: { width: 220, minHeight: 64, fontSize: 12, background: n.reviewRequired ? '#fff1d6' : n.type === 'operation' ? '#edf1ff' : '#ffffff', color: '#1d2230', borderColor: n.reviewRequired ? '#b36c00' : '#8490a3' } }));
  const edges = data.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => ({ ...e, label: e.kind, style: e.kind === 'revision' ? { strokeDasharray: '5 4' } : {} }));
  const detail = data.nodes.find((n) => n.id === selected);
  return <section>
    <h2>Resource history</h2>
    <p>Follow selected sources, production steps and reusable results. A submitted result still needs review. Review needed means an earlier input changed.</p>
    <div className="filters"><label>Resource <select value={focus} onChange={(e) => setFocus(e.target.value)}><option value="">All resources</option>{[...new Set(data.nodes.filter((n) => n.type === 'resource').map((n) => n.resourceId))].map((id) => <option key={id}>{id}</option>)}</select></label>{reload && <button onClick={reload}>Refresh history</button>}</div>
    <p className="muted">Checkpoint {data.checkpoint.seq} · {nodes.length} items · {edges.length} connections</p>
    {data.truncated && <p role="status">Partial graph. More connections exist outside this view. Use a focused graph query to inspect them.</p>}
    {!nodes.length ? <p>No resources registered yet.</p> : <div className="graph"><ReactFlow nodes={nodes} edges={edges} fitView key={focus + positions.size} nodesDraggable={false} onNodeClick={(_, node) => select(node.id)}><Background /><Controls showInteractive={false} /></ReactFlow></div>}
    {detail && <aside aria-label="Selected history item"><h3>{label(detail)}</h3><dl>
      <dt>{detail.type === 'operation' ? 'Operation ID' : 'Revision ID'}</dt><dd><code>{detail.operationId ?? detail.revisionId}</code></dd>
      {detail.contentHash && <><dt>Content hash</dt><dd><code>{detail.contentHash}</code></dd></>}
      {detail.inputSnapshotId && <><dt>Sealed input</dt><dd><code>{detail.inputSnapshotId}</code></dd></>}
    </dl><ul>{data.edges.filter((e) => e.source === detail.id || e.target === detail.id).map((e) => <li key={e.id}>{e.kind}: <button onClick={() => select(e.source === detail.id ? e.target : e.source)}>{label(data.nodes.find((n) => n.id === (e.source === detail.id ? e.target : e.source)))}</button></li>)}</ul></aside>}
    <details><summary>All history items</summary><ul>{data.nodes.map((n) => <li key={n.id}><button onClick={() => select(n.id)}>{label(n)}</button> <code>{n.revisionId ?? n.operationId}</code></li>)}</ul></details>
  </section>;
}
