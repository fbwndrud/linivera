import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { useLoad } from '../api-context.jsx';
import { LoadState } from './Status.jsx';
import { useT } from '../i18n/context.jsx';
import { relationLabel, familyLabel } from '../lib/graph-labels.js';
const elk = new ELK();
const label = (n, t) => n.type === 'operation' ? `${t("Production")} · ${t(n.status)}` : `${n.resourceId} · ${t(familyLabel(n.family))} · ${n.states.map((s) => t(s)).join(', ')}${n.reviewRequired ? ' · ' + t("Review needed") : ''}${n.reviewStatus === 'unknown' ? ' · ' + t("Review status unknown") : ''}`;

export function ResourceLineage() {
  const [state, reload] = useLoad('/api/resource-graph');
  if (!state.data) return <LoadState state={state} />;
  return <ResourceLineageContent data={state.data} reload={reload} />;
}

export function ResourceLineageContent({ data, reload }) {
  const t = useT();
  const itemLabel = (n) => label(n, t);
  const [positions, setPositions] = useState(new Map()); const [selected, select] = useState(null);
  const [focus, setFocus] = useState('');
  const [family, setFamily] = useState(''); const [scopeId, setScope] = useState('');
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
  const nodes = data.nodes.filter((n) => visible.has(n.id) && (!family || n.type === 'operation' || n.family === family)
    && (!scopeId || n.type === 'operation' || n.scopedSelections?.some((choice) => choice.scopeId === scopeId))).map((n) => ({ id: n.id, position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: { label: itemLabel(n) }, style: { width: 220, minHeight: 64, fontSize: 12, background: n.reviewRequired ? '#fff1d6' : n.type === 'operation' ? '#edf1ff' : '#ffffff', color: '#1d2230', borderColor: n.reviewRequired ? '#b36c00' : '#8490a3' } }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, label: t(relationLabel(e.kind)), style: ['revision', 'usage', 'context-evidence'].includes(e.kind) ? { strokeDasharray: '5 4' } : {} }));
  const detail = data.nodes.find((n) => n.id === selected);
  return <section>
    <h2>{t("Resource history")}</h2>
    <p>{t("Follow selected sources, production steps and reusable results. A submitted result still needs review. Review needed means an earlier input changed.")}</p>
    <div className="filters"><label>{t("Resource")} <select value={focus} onChange={(e) => setFocus(e.target.value)}><option value="">{t("All resources")}</option>{[...new Set(data.nodes.filter((n) => n.type === 'resource').map((n) => n.resourceId))].map((id) => <option key={id}>{id}</option>)}</select></label>{reload && <button onClick={reload}>{t("Refresh history")}</button>}</div>
    <div className="filters"><label>{t("Data type")} <select value={family} onChange={(event) => setFamily(event.target.value)}><option value="">{t("All data types")}</option>{[...new Set(data.nodes.map((node) => node.family).filter(Boolean))].map((type) => <option key={type} value={type}>{t(familyLabel(type))}</option>)}</select></label>
      <label>{t("Episode selection")} <select value={scopeId} onChange={(event) => setScope(event.target.value)}><option value="">{t("All episode selections")}</option>{[...new Set(data.nodes.flatMap((node) => node.scopedSelections ?? []).map((choice) => choice.scopeId))].map((id) => <option key={id}>{id}</option>)}</select></label></div>
    <p className="muted">{t("Connection types")}: {[...new Set(data.edges.map((edge) => edge.kind))].map((kind) => t(relationLabel(kind))).join(' · ')}</p>
    <p className="muted">{t("Usage and included-file connections describe context and packaging. Production inputs and outputs describe causal work.")}</p>
    <p className="muted">{t("Checkpoint {seq} · {items} items · {connections} connections", { seq: data.checkpoint.seq, items: nodes.length, connections: edges.length })}</p>
    {data.truncated && <p role="status">{t("Partial graph. More connections exist outside this view. Use a focused graph query to inspect them.")}</p>}
    {data.coverage?.contentVerification === 'returned-scope-verified' && <p role="status">{t("Only returned files and connections were verified. Discovery and review coverage remain unknown.")}</p>}
    {!!data.coverage?.omittedEdgeCount && <p role="status">{t("{count} connections exceed this page budget.", { count: data.coverage.omittedEdgeCount })}</p>}
    {!nodes.length ? <p>{t("No resources registered yet.")}</p> : <div className="graph"><ReactFlow nodes={nodes} edges={edges} fitView key={focus + positions.size} nodesDraggable={false} onNodeClick={(_, node) => select(node.id)}><Background /><Controls showInteractive={false} /></ReactFlow></div>}
    {detail && <aside aria-label={t("Selected history item")}><h3>{itemLabel(detail)}</h3><dl>
      <dt>{detail.type === 'operation' ? t("Operation ID") : t("Revision ID")}</dt><dd><code>{detail.operationId ?? detail.revisionId}</code></dd>
      {detail.contentHash && <><dt>{t("Content hash")}</dt><dd><code>{detail.contentHash}</code></dd></>}
      {detail.inputSnapshotId && <><dt>{t("Sealed input")}</dt><dd><code>{detail.inputSnapshotId}</code></dd></>}
    </dl><ul>{(detail.scopedSelections ?? []).map((choice) => <li key={choice.scopeId + choice.bindingKey}>{t("Episode selection")}: {choice.scopeId} · {choice.role} · {t(choice.mode)}</li>)}</ul><ul>{data.edges.filter((e) => e.source === detail.id || e.target === detail.id).map((e) => <li key={e.id}>{t(relationLabel(e.kind))}: <button onClick={() => select(e.source === detail.id ? e.target : e.source)}>{itemLabel(data.nodes.find((n) => n.id === (e.source === detail.id ? e.target : e.source)))}</button></li>)}</ul></aside>}
    {(data.boundaryNodes?.length ?? 0) > 0 && <details><summary>{t("Page boundary")}</summary><ul>{data.boundaryNodes.map((node) => <li key={node.id}>{itemLabel(node)}</li>)}</ul></details>}
    {data.coverage && <details className="technical"><summary>{t("Verification coverage")}</summary><pre>{JSON.stringify(data.coverage, null, 2)}</pre></details>}
    <details><summary>{t("All history items")}</summary><ul>{data.nodes.map((n) => <li key={n.id}><button onClick={() => select(n.id)}>{itemLabel(n)}</button> <code>{n.revisionId ?? n.operationId}</code></li>)}</ul></details>
  </section>;
}
