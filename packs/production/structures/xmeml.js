import { invalid, projection } from './common.js';
import { xmlTree, child, children, textOf, frame, frameRate } from './xml-tree.js';

export function xmeml(bytes) {
  const root = xmlTree(bytes);
  if (root.name !== 'xmeml' || root.attributes.version !== '5') invalid('XMEML 5 document required');
  const p = projection('xmeml'); const files = new Map(); const items = new Map(); const pending = [];
  let sequences = 0;
  function catalog(node) {
    if (node.name === 'file' && node.children.length && node.attributes.id) {
      if (files.has(node.attributes.id)) invalid('duplicate XMEML file definition');
      files.set(node.attributes.id, node);
    }
    for (const item of node.children) catalog(item);
  }
  catalog(root);
  const mediaIds = new Set();
  function media(node, owner) {
    const file = child(node, 'file');
    if (!file) {
      if (node.name === 'clipitem' && !child(node, 'sequence')) {
        p.ref(owner + '/missing-media', owner, 'media', 'Missing media for clip'); p.unknown(`Missing media: ${owner}`);
      }
      return;
    }
    const target = file.children.length ? file : files.get(file.attributes.id);
    if (!target) invalid('unresolved XMEML file ID');
    const id = target.locator;
    if (!mediaIds.has(id)) {
      mediaIds.add(id); p.unit(id, 'media', { nativeId: target.attributes.id ?? null, name: textOf(target, 'name') ?? null, rate: frameRate(target) });
      const url = textOf(target, 'pathurl');
      p.ref(id + '/pathurl', id, 'media', url || `Missing pathurl for file ${target.attributes.id ?? id}`);
      if (!url) p.unknown(`Missing media path: ${id}`);
    }
    p.link(owner, id, 'clip-media');
  }
  function range(node, start, end, rate) {
    const a = frame(node, start, { optional: true }); const b = frame(node, end, { optional: true });
    if (a === null || b === null || a === -1 || b === -1 || !rate) {
      p.unknown(`Unresolved timing ${node.locator}/${start}:${end}`); return null;
    }
    if (b < a) invalid('XMEML range is reversed'); return { startFrame: a, endFrame: b, rate };
  }
  function extras(node, owner, rate) {
    for (const type of ['filter', 'marker']) for (const item of children(node, type)) {
      const effect = child(item, 'effect');
      p.unit(item.locator, type, { name: textOf(item, 'name') ?? null, effectId: effect ? textOf(effect, 'effectid') ?? null : null,
        sourceRange: type === 'marker' ? range(item, 'in', 'out', rate) : null });
      p.link(owner, item.locator, 'editing-' + type);
      if (type === 'filter') p.unknown(`Uninterpreted effect: ${item.locator}`);
    }
  }
  function sequence(node, parent = null) {
    sequences++; const id = node.locator; const rate = frameRate(node);
    if (!rate) invalid('XMEML sequence requires a frame rate');
    p.unit(id, 'sequence', { nativeId: node.attributes.id ?? null, name: textOf(node, 'name') ?? null, rate });
    if (parent) p.link(parent, id, 'nested-sequence'); extras(node, id, rate);
    const mediaNode = child(node, 'media'); if (!mediaNode) return;
    for (const kind of ['video', 'audio']) for (const part of children(mediaNode, kind)) for (const track of children(part, 'track')) {
      p.unit(track.locator, 'track', { mediaType: kind }); p.link(id, track.locator, 'sequence-track');
      for (const item of track.children) {
        if (!['clipitem', 'transitionitem', 'generatoritem'].includes(item.name)) {
          if (!['enabled', 'locked', 'outputchannelindex'].includes(item.name)) p.unknown(`Uninterpreted track item: ${item.locator}`);
          continue;
        }
        const itemRate = frameRate(item, rate); const itemId = item.locator;
        const type = item.name === 'clipitem' ? 'clip' : item.name === 'transitionitem' ? 'transition' : 'generator';
        if (item.attributes.id) {
          if (items.has(item.attributes.id)) invalid('duplicate XMEML clip/transition ID'); items.set(item.attributes.id, itemId);
        }
        p.unit(itemId, type, { nativeId: item.attributes.id ?? null, name: textOf(item, 'name') ?? null,
          parentRange: range(item, 'start', 'end', rate), sourceRange: type === 'clip' ? range(item, 'in', 'out', itemRate) : null });
        p.link(track.locator, itemId, 'track-item'); media(item, itemId); extras(item, itemId, itemRate);
        for (const link of children(item, 'link')) { const target = textOf(link, 'linkclipref'); if (target) pending.push({ source: itemId, target }); else p.unknown(`Unresolved clip link: ${link.locator}`); }
        const nested = child(item, 'sequence'); if (nested) sequence(nested, itemId);
        if (type !== 'clip' || textOf(item, 'mixedratesoffset') || child(item, 'stillframe')) p.unknown(`Editing interpretation requires editor verification: ${itemId}`);
      }
    }
  }
  function walk(node) { if (node.name === 'sequence') sequence(node); else for (const item of node.children) walk(item); }
  walk(root);
  if (!sequences) invalid('XMEML contains no sequence');
  for (const link of pending) { if (!items.has(link.target)) invalid('unresolved linked clip ID'); p.link(link.source, items.get(link.target), 'linked-clip'); }
  p.unknown('Editorial structure only; effects, retiming, inherited editor settings and native project restoration are not executed.');
  return p.finish();
}
