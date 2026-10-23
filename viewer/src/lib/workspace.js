/** Keep matching ancestors visible so search never disconnects a section from its group. */
export function visibleOutline(nodes, query, filter, attention = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const wanted = new Set(attention);
  const search = query.trim().toLocaleLowerCase();
  const visible = new Set();
  for (const node of nodes) {
    if (search && !`${node.title} ${node.id}`.toLocaleLowerCase().includes(search)) continue;
    if (filter === 'attention' && !wanted.has(node.id)) continue;
    if (filter === 'finalized' && node.status !== 'committed') continue;
    if (filter === 'draft' && node.status === 'committed') continue;
    let current = node;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id); visible.add(current.id);
      current = byId.get(current.parentId);
    }
  }
  return visible;
}

export function attentionIds(status) {
  if (!status?.ok) return [];
  return [...new Set([...(status.stale ?? []), ...(status.flagged ?? []),
    ...(status.recheck ?? []), ...(status.drift ?? []).map((d) => d.nodeId)])];
}

/** Reading progress is manuscript coverage, not an assertion that checks passed. */
export function workProgress(nodes) {
  const sections = nodes.filter((node) => node.kind === 'leaf');
  return { total: sections.length, written: sections.filter((node) => node.hasBody).length,
    finalized: sections.filter((node) => node.status === 'committed').length };
}

export function unverifiedRecords(status) {
  return status?.ledger?.ok === false || Object.values(status?.ledger ?? {}).some((record) => record && typeof record === 'object' && record.ok === false);
}

export function nextAction(nodes, status) {
  if (!status?.ok || unverifiedRecords(status)) return { screen: 'receipts', id: null, label: 'Open review records' };
  const attention = attentionIds(status);
  if (attention.length) return { screen: 'receipt', id: attention[0], label: 'Open section review' };
  const next = nodes.find((node) => node.id === status.next?.nodeId && node.hasBody);
  const readable = next ?? nodes.find((node) => node.kind === 'leaf' && node.hasBody);
  return readable ? { screen: 'read', id: readable.id, label: 'Read manuscript' } : null;
}

export const NAV_GROUPS = [
  { name: 'Manuscript', screen: 'home', items: [['home', 'Overview'], ['promises', 'Story threads']] },
  { name: 'Review', screen: 'review', items: [['review', 'Evidence desk'], ['changes', 'Changes'], ['receipts', 'Review records'], ['checks', 'Check groups']] },
  { name: 'Publish', screen: 'publish', items: [['publish', 'Reading edition']] },
  { name: 'Library', screen: 'sources', items: [['resources', 'Resources'], ['sources', 'Sources & evidence'], ['blocks', 'Figures & references'], ['graph', 'Connections']] },
  { name: 'Settings', screen: 'stages', items: [['stages', 'Writing steps'], ['examples', 'Examples']] },
];
export const navGroup = (screen) => NAV_GROUPS.find((group) => group.items.some(([page]) => page === screen))
  ?? NAV_GROUPS[screen === 'receipt' ? 1 : ['entity', 'source', 'resource'].includes(screen) ? 3 : 0];

export const workspaceNavigation = (work) => !work ? [] : work.mode === 'resources'
  ? [{ name: 'Library', screen: 'resources', items: [['resources', 'Resources'], ['graph', 'Connections'], ['examples', 'Examples']] }] : NAV_GROUPS;
export const writingScreenUnavailable = (work, screen) => work?.mode === 'resources'
  && !['home', 'resources', 'resource', 'graph', 'examples'].includes(screen);
