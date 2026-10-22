import { invalid, object } from './common.js';

export function rationalTime(value) {
  if (!object(value) || value.OTIO_SCHEMA !== 'RationalTime.1' || !Number.isFinite(value.value) || Math.abs(value.value) > Number.MAX_SAFE_INTEGER || !Number.isFinite(value.rate) || value.rate <= 0) invalid('bounded OTIO RationalTime.1 required');
  const result = { value: value.value, rate: value.rate };
  boundedSeconds(result.value / result.rate); return result;
}
export const seconds = (time) => time.value / time.rate;
export function boundedSeconds(value) {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid('OTIO time exceeds numeric range');
  return value;
}
export function timeRange(value) {
  if (value == null) return null;
  if (!object(value) || value.OTIO_SCHEMA !== 'TimeRange.1') invalid('OTIO TimeRange.1 required');
  const range = { start: rationalTime(value.start_time), duration: rationalTime(value.duration) };
  if (range.duration.value < 0) invalid('negative OTIO duration'); return range;
}
