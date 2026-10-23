import { SaxesParser } from 'saxes';
import { invalid, MAX_STRUCTURE_BYTES } from './common.js';

/** Bounded XML tree with stable structural locators; no DTD or entity resolution hooks. */
export function xmlTree(bytes) {
  if (bytes.length > MAX_STRUCTURE_BYTES) invalid('XML structure exceeds 6MiB');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { invalid('XML requires UTF-8'); }
  const parser = new SaxesParser(); const stack = []; const roots = []; let count = 0;
  const siblingCounts = new WeakMap();
  parser.on('error', () => invalid('malformed XML'));
  parser.on('doctype', (doctype) => { if (doctype.trim() !== 'xmeml') invalid('external and internal DTDs are unsupported'); });
  parser.on('processinginstruction', () => invalid('XML processing instructions are unsupported'));
  parser.on('opentag', (tag) => {
    if (++count > 32768 || stack.length >= 64 || tag.name.includes(':') || Object.keys(tag.attributes).some((name) => name === 'xmlns' || name.startsWith('xmlns:'))) invalid('XML structure exceeds limits or uses unsupported namespaces');
    const parent = stack.at(-1); let index = 0;
    if (parent) {
      const counts = siblingCounts.get(parent); index = counts.get(tag.name) ?? 0; counts.set(tag.name, index + 1);
    }
    const node = { name: tag.name, attributes: tag.attributes, text: '', children: [], locator: parent ? `${parent.locator}/${tag.name}/${index}` : '/' + tag.name };
    if (parent) parent.children.push(node); else roots.push(node);
    siblingCounts.set(node, new Map());
    stack.push(node);
  });
  const append = (value) => { if (stack.length) stack.at(-1).text += value; };
  parser.on('text', append); parser.on('cdata', append); parser.on('closetag', () => stack.pop());
  parser.write(text).close();
  if (roots.length !== 1) invalid('XML requires one document root'); return roots[0];
}
export const children = (node, name) => node.children.filter((n) => n.name === name);
export function child(node, name) {
  const found = children(node, name); if (found.length > 1) invalid(`duplicate XML ${name}`); return found[0];
}
export const textOf = (node, name) => child(node, name)?.text.trim();
export function frame(node, name, { optional = false } = {}) {
  const text = textOf(node, name);
  if (text === undefined && optional) return null;
  if (!/^-?\d+$/.test(text ?? '') || !Number.isSafeInteger(Number(text)) || Number(text) < -1) invalid(`invalid XML ${name} frame`);
  return Number(text);
}
export function frameRate(node, fallback = null) {
  const rate = child(node, 'rate'); if (!rate) return fallback;
  const base = frame(rate, 'timebase'); const ntsc = textOf(rate, 'ntsc') ?? 'FALSE';
  if (base <= 0 || !['TRUE', 'FALSE'].includes(ntsc)) invalid('invalid XML frame rate');
  return { numerator: base * (ntsc === 'TRUE' ? 1000 : 1), denominator: ntsc === 'TRUE' ? 1001 : 1 };
}
