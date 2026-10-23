import { array, invalid, object } from './common.js';

export function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid('unknown record field');
}
export function text(value, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid('bounded nonempty record text required'); return value;
}
export function nonempty(value, label) {
  array(value, label); if (!value.length) invalid(`${label} must not be empty`); return value;
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) invalid('explicit UTC timestamp required');
  const time = Date.parse(value); const normalized = value.length === 20 ? value.slice(0, -1) + '.000Z' : value;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== normalized) invalid('invalid calendar timestamp'); return value;
}
export function identity(value) {
  fields(value, ['platform', 'account', 'externalId']);
  return { platform: text(value.platform, 128), account: text(value.account, 128), externalId: text(value.externalId, 512) };
}
