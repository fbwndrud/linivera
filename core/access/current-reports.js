import { canonicalJson } from '../util/hash.js';
import { timestamp } from './records.js';

/** Order by host observation time, never report creation time or readiness success. */
export function partitionCurrentConnectionReports(reports) {
  const groups = new Map();
  for (const report of reports) {
    const input = report.value.input;
    const key = canonicalJson([input.requestRevisionId, input.accountAlias, input.projectAlias, input.accessSpecificationRevisionId]);
    const rows = groups.get(key) ?? []; rows.push(report); groups.set(key, rows);
  }
  const current = []; const historical = [];
  for (const rows of groups.values()) {
    const latest = Math.max(...rows.map(({ value }) => timestamp(value.freshness.checkedAt)));
    for (const report of rows) (timestamp(report.value.freshness.checkedAt) === latest ? current : historical).push(report);
  }
  return { current, historical };
}
