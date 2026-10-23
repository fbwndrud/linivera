import { projection } from './common.js';

/** Replay bounded structural facts without changing the historical version 1 parser. */
export function extendProjection(base) {
  const p = projection(base.format); p.value.parserVersion = 2;
  for (const { id, kind, ...details } of base.units) p.unit(id, kind, details);
  for (const { source, target, kind, ...details } of base.links) p.link(source, target, kind, details);
  for (const ref of base.references) p.ref(ref.key, ref.unitId, ref.role, ref.hint, ref.required);
  for (const message of base.coverage.unknown) p.unknown(message);
  p.value.coverage.omittedUnknown += base.coverage.omittedUnknown;
  return p;
}
