import { EditionProvider, useEdition } from './edition-context.jsx';
import { EditionSelect, EditionNotice } from './components/EditionSelect.jsx';
import { LanguageSelect } from './components/LanguageSelect.jsx';
import { useT } from './i18n/context.jsx';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ApiContext, useApi, useLoad } from './api-context.jsx';
import { createApi, readToken, stripToken } from './lib/api.js';
import { createStaticApi, readStaticData } from './lib/static-api.js';
import { hrefFor, parseRoute } from './lib/route.js';
import { Outline } from './components/Outline.jsx';
import { LoadState, TechnicalDetails } from './components/Status.jsx';
import { errorSummary } from './lib/labels.js';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Home } from './screens/Home.jsx';
import { Examples } from './screens/Examples.jsx';
import { ExampleNotice } from './components/ExampleNotice.jsx';
import { Changes } from './screens/Changes.jsx';
import { ReviewDesk } from './screens/ReviewDesk.jsx';
import { Publish } from './screens/Publish.jsx';
import { Reader } from './screens/Reader.jsx';
import { Entity } from './screens/Entity.jsx';
import { Receipts } from './screens/Receipts.jsx';
import { Receipt } from './screens/Receipt.jsx';
import { Stages } from './screens/Stages.jsx';
import { PromiseBoard } from './screens/PromiseBoard.jsx';
import { CheckSets } from './screens/CheckSets.jsx';
import { Source, Sources } from './screens/Sources.jsx';
import { Resource, Resources } from './screens/Resources.jsx';
import { Blocks } from './screens/Blocks.jsx';
import { ReadingProvider, useReading } from './reading-context.jsx';
import { ReadingSettings } from './components/ReadingSettings.jsx';
import { navGroup, workspaceNavigation, writingScreenUnavailable } from './lib/workspace.js';

// 관계도(React Flow + elkjs)는 커서 그 화면을 열 때만 읽는다.
const Graph = lazy(() => import('./screens/Graph.jsx').then((m) => ({ default: m.Graph })));

const session = () => { try { return window.sessionStorage; } catch { return null; } };

export function App() {
  // 내보낸 화면이면 실린 한 벌을, 아니면 뷰어 서버 API 를 쓴다.
  const api = useMemo(() => {
    const data = readStaticData(document);
    if (data) return createStaticApi(data);
    const token = readToken(window.location, session());
    return createApi({ token });
  }, []);
  useEffect(() => {
    const cleanUrl = stripToken(window.location.href);
    if (cleanUrl !== null) window.history.replaceState(window.history.state, '', cleanUrl);
  }, []);
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return <ApiContext.Provider value={api}><EditionProvider><ReadingProvider><Shell route={route} /></ReadingProvider></EditionProvider></ApiContext.Provider>;
}

export function Screen({ route, outline, reloadOutline, readId }) {
  const t = useT();
  if (!outline.data) return <LoadState state={outline} />;
  if (writingScreenUnavailable(outline.data, route.screen)) return <section><h1>{t("Writing pages unavailable")}</h1><p>{t("This workspace contains resources. Open its selected sources and approved results in the Library.")}</p><a href={hrefFor('resources')}>{t("Open resources")}</a></section>;
  if (outline.data.mode === 'resources' && route.screen === 'home') return <Resources allowExport={outline.data.capabilities?.viewerExport} />;
  switch (route.screen) {
    case 'examples': return <Examples />;
    case 'resources': return <Resources allowExport={outline.data.capabilities?.viewerExport} />;
    case 'resource': return <Resource key={route.id} id={route.id} />;
    case 'read': return <Reader key={route.id} id={route.id} observationId={route.observation} />;
    case 'changes': return <Changes />;
    case 'review': return <ReviewDesk outline={outline.data} />;
    case 'publish': return <Publish outline={outline.data} initialId={readId} />;
    case 'entity': return <Entity id={route.id} />;
    case 'receipts': return <Receipts />;
    case 'receipt': return <Receipt id={route.id} outline={outline.data} />;
    case 'stages': return <><h1>{t("Settings")}</h1><ReadingSettings /><Stages onChanged={reloadOutline} /></>;
    case 'promises': return <PromiseBoard outline={outline.data} />;
    case 'checks': return <CheckSets />;
    case 'sources': return <Sources outline={outline.data} />;
    case 'source': return <Source id={route.id} outline={outline.data} />;
    case 'blocks': return <Blocks outline={outline.data} />;
    case 'graph': // 색은 작품 제목으로 저장하므로 제목을 안 뒤에 그린다(새로 고침해도 고른 색을 읽는다).
      return outline.data
        ? <Suspense fallback={<p className="muted">{t("Loading…")}</p>}><Graph key={outline.data.title} title={outline.data.title} resourceOnly={outline.data.mode === 'resources'} /></Suspense>
        : <LoadState state={outline} />;
    default: return <Home outline={outline} />;
  }
}

function Shell({ route }) {
  const t = useT();
  const api = useApi();
  const { variant, reload: reloadEditions } = useEdition();
  const [outline, reloadOutline] = useLoad('/api/work');
  const [closed, setClosed] = useState(false);
  const [shutdownError, setShutdownError] = useState(null);
  const [viewVersion, setViewVersion] = useState(0);
  const [contentsOpen, setContentsOpen] = useState(() => window.matchMedia('(min-width: 960px)').matches);
  const { focused, setFocused } = useReading();
  const main = useRef(null);
  const firstRoute = useRef(true);
  const lastRead = useRef(null);
  if (route.screen === 'read') lastRead.current = route.id;
  const groups = workspaceNavigation(outline.data);
  const wideMode = ['changes', 'review', 'publish'].includes(route.screen);
  const resourceOnly = outline.data?.mode === 'resources';
  const readId = lastRead.current ?? outline.data?.nodes.find((n) => n.kind === 'leaf' && n.hasBody)?.id ?? null;
  const group = resourceOnly ? groups[0] : navGroup(route.screen);
  useEffect(() => {
    if (route.screen !== 'read') setFocused(false);
    if (firstRoute.current) { firstRoute.current = false; return; }
    if (!window.matchMedia('(min-width: 960px)').matches) setContentsOpen(false);
    main.current?.focus();
    window.scrollTo({ top: 0 });
  }, [route.screen, route.id, setFocused]);
  useEffect(() => { document.title = `${outline.data?.title || t("Linivera")} | ${t(group.name)}`; }, [outline.data?.title, group.name, t]);
  if (closed) return <main className="closed"><p>{t("Viewer closed. Reopen the work to view it again.")}</p></main>;
  const shutdown = async () => {
    setShutdownError(null);
    try { await api.post('/api/shutdown', {}); setClosed(true); }
    catch (error) { setShutdownError(error); }
  };
  return (
    <div className={`shell ${contentsOpen && !resourceOnly && !wideMode ? 'contents-open' : 'contents-closed'} ${focused ? 'focus-mode' : ''}`}>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>{t("Skip to content")}</a>
      <header className="top">
        <a className="title" href="#/"><span className="folio-mark" aria-hidden="true">{t("L")}</span>{outline.data?.title || t("Linivera")}</a>
        <nav aria-label={t("Pages")}>
          {groups.map((item) => <a key={item.name} href={item.screen === 'home' && readId ? hrefFor('read', readId) : item.screen === 'home' ? '#/' : hrefFor(item.screen)} aria-current={group.name === item.name ? 'true' : undefined}>{t(item.name)}</a>)}
        </nav>
        <EditionSelect /><LanguageSelect />
        {api.static ? <span className="exported-label">{t("Exported view · Read only")}</span> : <button type="button" className="quiet close-viewer" onClick={shutdown}>{t("Close viewer")}</button>}
        {shutdownError ? <div className="error" role="alert">{t(errorSummary(shutdownError.code))}<TechnicalDetails code={shutdownError.code} message={shutdownError.message} /></div> : null}
      </header>
      <div className="workspace-nav">
        {!resourceOnly && !wideMode ? <button type="button" className="quiet contents-toggle" aria-expanded={contentsOpen} aria-controls="contents-panel" onClick={() => setContentsOpen((value) => !value)}>{contentsOpen ? t("Hide contents") : t("Show contents")}</button> : null}
        <nav aria-label={t("{group} pages", { group: t(group.name) })}>{(outline.data ? group.items : []).map(([screen, label]) => <a key={screen} aria-current={(route.screen === screen || (resourceOnly && route.screen === 'home' && screen === 'resources')) ? 'page' : undefined} href={screen === 'home' ? '#/' : hrefFor(screen)}>{t(label)}</a>)}</nav>
        {!api.static ? <button type="button" className="quiet refresh-view" disabled={outline.loading} onClick={() => { reloadOutline(); reloadEditions(); setViewVersion((n) => n + 1); }}>{outline.loading ? t("Refreshing…") : t("Refresh view")}</button> : null}
      </div>
      {!resourceOnly ? <aside className="side" id="contents-panel" hidden={!contentsOpen || focused || wideMode}>{outline.data ? <Outline nodes={outline.data.nodes} current={['read', 'receipt'].includes(route.screen) ? route.id : null} status={outline.data.status} /> : <LoadState state={outline} />}</aside> : null}
      <main className={`main main-${route.screen}`} id="main-content" ref={main} tabIndex={-1}><ExampleNotice /><EditionNotice /><ErrorBoundary key={`${route.screen}:${route.id}:${viewVersion}:${variant}`}><Screen route={route} outline={outline} reloadOutline={reloadOutline} readId={readId} /></ErrorBoundary></main>
    </div>
  );
}
