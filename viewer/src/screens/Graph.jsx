import { useT } from '../i18n/context.jsx';
import { lazy, Suspense, useState } from 'react';
import { kindLabel } from '../lib/labels.js';
import { useLoad } from '../api-context.jsx';
import { hrefFor } from '../lib/route.js';
import { focusedConnections } from '../lib/connections.js';
import { LoadState } from '../components/Status.jsx';
import { ResourceLineage } from '../components/ResourceLineage.jsx';

const Diagram = lazy(() => import('../components/ConnectionDiagram.jsx'));
export function Graph({ title, resourceOnly = false }) {
  const t = useT();
  return <><h1>{t("Connections")}</h1><ResourceLineage />{!resourceOnly && <WritingConnections title={title} />}</>;
}

function WritingConnections({ title }) {
  const t = useT();
  const [state] = useLoad('/api/graph');
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [diagram, setDiagram] = useState(false);
  if (!state.data) return <LoadState state={state} />;
  const graph = state.data, focus = focusedConnections(graph, selected, query);
  return <section className="connections-screen">
    <p className="eyebrow">{t("Library · Connections")}</p><h2>{t("Writing connections")}</h2>
    <p>{t("Select a character, place or other definition to see its actual manuscript references. Mentions and declared links do not by themselves describe a relationship.")}</p>
    {!focus.entity ? <div className="empty-state"><h2>{t("No definitions yet")}</h2><p>{t("Ask your AI assistant to record the people, places or concepts you want to follow.")}</p></div> : <>
      <div className="impact-filters"><label>{t("Definition")}<select value={focus.entity.refId} onChange={(e) => { setSelected(e.target.value); setDiagram(false); }}>{graph.entities.map((e) => <option key={e.id} value={e.refId}>{e.label} · {t(kindLabel(e.kind))}</option>)}</select></label>
        <label>{t("Find a section")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
      <div className="catalog-card"><h2><a href={hrefFor('entity', focus.entity.refId)}>{focus.entity.label}</a></h2><p className="muted">{focus.nodes.length} {t("connected sections in this scope")}</p>
        {focus.nodes.length ? <ul className="section-list">{focus.nodes.map((n) => { const edge = focus.bySource.get(n.id); return <li key={n.id}><a href={hrefFor('read', n.refId)}>{n.label}</a><span className="muted">{edge.weight ? t("{value0} text mentions", { value0: edge.weight }) : t("Declared in section details")}{edge.declared && edge.weight ? t(" · Also declared") : ''}</span></li>; })}</ul> : <p>{t("No manuscript references match this scope.")}</p>}
      </div>
      {focus.nodes.length ? <><button type="button" className="quiet" aria-expanded={diagram} onClick={() => setDiagram((v) => !v)}>{diagram ? t("Hide diagram") : t("Show diagram for these references")}</button>
        {diagram ? <Suspense fallback={<p>{t("Loading the reference diagram…")}</p>}><Diagram key={`${focus.entity.id}:${query}`} graph={{ ...graph, nodes: focus.nodes, entities: [focus.entity], edges: focus.edges, links: [] }} title={title} /></Suspense> : null}</> : null}
    </>}
    {graph.links?.length ? <details className="catalog-card"><summary>{graph.links.length} {t("recorded links between sections")}</summary><ul>{graph.links.map((l) => <li key={`${l.from}:${l.to}:${l.index}`}><a href={hrefFor('read', l.from)}>{graph.nodes.find((n) => n.refId === l.from)?.label || l.from}</a> → <a href={hrefFor('read', l.to)}>{graph.nodes.find((n) => n.refId === l.to)?.label || l.to}</a>{l.label ? ` · ${l.label}` : ''}</li>)}</ul></details> : null}
  </section>;
}
