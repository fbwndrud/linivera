import { array, invalid, projection } from './common.js';
import { fields, text, nonempty, timestamp, identity } from './record-values.js';

/** Source-attested delivery knowledge; a record never grants rights or approves an internal publication. */
export function deliveryRecord(value) {
  fields(value, ['version', 'recordType', 'recordId', 'issuer', 'observedAt', 'subjects', 'evidence', 'details']);
  if (value.version !== 1 || !['brief', 'rights', 'release', 'performance'].includes(value.recordType)) invalid('supported delivery record version/type required');
  const p = projection('delivery-record');
  const root = { recordType: value.recordType, recordId: text(value.recordId, 128), issuer: text(value.issuer, 128), observedAt: timestamp(value.observedAt) };
  if (['release', 'performance'].includes(value.recordType)) {
    root['identity'] = identity(value.details?.identity);
    const role = value.recordType === 'release' ? 'deliverable' : 'release';
    if (value.subjects?.length !== 1 || value.subjects[0]?.role !== role) invalid(`one exact ${role} subject required`);
  }
  if (value.recordType === 'performance') {
    const period = value.details.period; fields(period, ['start', 'end', 'asOf', 'basis']);
    for (const key of ['start', 'end', 'asOf']) timestamp(period[key]);
    if (!['interval', 'cumulative'].includes(period.basis) || Date.parse(period.start) >= Date.parse(period.end)
      || Date.parse(period.end) > Date.parse(period.asOf) || Date.parse(period.asOf) > Date.parse(root.observedAt)) invalid('ordered metric window and observation cutoff required');
    root['period'] = { ...period };
  }
  p.unit('/', 'delivery-record', root);
  for (const group of ['subjects', 'evidence']) {
    const rows = group === 'subjects' ? nonempty(value[group], group) : array(value[group], group);
    for (const [i, row] of rows.entries()) {
      fields(row, ['role', 'hint']); const id = `/${group}/${i}`; const role = text(row.role, 128);
      p.unit(id, group === 'subjects' ? 'record-subject' : 'record-evidence', { role });
      p.link('/', id, group === 'subjects' ? 'record-subject' : 'record-evidence');
      p.ref(id + '/hint', id, role, text(row.hint));
    }
  }
  if (!value.evidence.length) { p.ref('/@evidence', '/', 'source-evidence', 'Missing source evidence'); p.unknown('Source document has not been retained.'); }
  const ids = new Set();
  function entry(id, kind, row, details) {
    const name = text(row.id, 128); if (ids.has(name)) invalid('duplicate record entry id'); ids.add(name);
    p.unit(id, kind, { name, ...details }); p.link('/', id, 'record-item');
    const seen = new Set();
    for (const index of array(row.evidence, 'entry evidence')) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= value.evidence.length || seen.has(index)) invalid('entry evidence must name unique declared evidence indices');
      seen.add(index); p.link(id, '/evidence/' + index, 'record-evidence');
    }
    if (!seen.size) { p.ref(id + '/@evidence', id, 'source-evidence', 'Missing evidence for ' + id); p.unknown(`Entry evidence absent at ${id}`); }
  }
  if (value.recordType === 'brief') {
    fields(value.details, ['requirements']);
    for (const [i, row] of nonempty(value.details.requirements, 'brief requirements').entries()) {
      fields(row, ['id', 'text', 'priority', 'evidence']);
      if (!['required', 'preferred'].includes(row.priority)) invalid('explicit brief priority required');
      entry(`/details/requirements/${i}`, 'brief-requirement', row, { text: text(row.text), priority: row.priority });
    }
  }
  if (value.recordType === 'rights') {
    fields(value.details, ['claims']);
    for (const [i, row] of nonempty(value.details.claims, 'rights claims').entries()) {
      fields(row, ['id', 'status', 'permissions', 'territories', 'channels', 'validFrom', 'validUntil', 'conditions', 'attribution', 'evidence']);
      if (!['reported-granted', 'reported-denied', 'reported-revoked', 'unknown'].includes(row.status)) invalid('reported rights status required');
      const validFrom = row.validFrom === null ? null : timestamp(row.validFrom); const validUntil = row.validUntil === null ? null : timestamp(row.validUntil);
      if (validFrom && validUntil && Date.parse(validUntil) < Date.parse(validFrom)) invalid('reversed rights period');
      const scope = {};
      for (const key of ['permissions', 'territories', 'channels']) {
        scope[key] = array(row[key], 'rights scope').map((item) => text(item, 128));
        if (!scope[key].length) p.unknown(`Unreported rights ${key} at /details/claims/${i}`);
      }
      entry(`/details/claims/${i}`, 'rights-claim', row, { status: row.status, ...scope, validFrom, validUntil,
        conditions: row.conditions === null ? null : text(row.conditions), attribution: row.attribution == null ? null : text(row.attribution) });
    }
  }
  if (value.recordType === 'release') {
    const details = value.details; fields(details, ['identity', 'status', 'publishedAt', 'url']);
    if (!['reported-published', 'reported-scheduled', 'reported-removed', 'unknown'].includes(details.status)) invalid('reported release status required');
    const publishedAt = details.publishedAt === null ? null : timestamp(details.publishedAt);
    if (details.status === 'reported-published' && publishedAt && Date.parse(publishedAt) > Date.parse(root.observedAt)) invalid('published time exceeds observation time');
    if (details.url !== null) {
      text(details.url, 8192); let url; try { url = new URL(details.url); } catch { invalid('absolute release URL required'); }
      if (!['https:', 'http:'].includes(url.protocol)) invalid('HTTP release URL required');
    }
    p.unit('/details', 'external-release', { status: details.status, publishedAt, hasReportedUrl: details.url !== null });
    p.link('/', '/details', 'record-item');
  }
  if (value.recordType === 'performance') {
    fields(value.details, ['identity', 'period', 'metrics']);
    for (const [i, row] of nonempty(value.details.metrics, 'performance metrics').entries()) {
      fields(row, ['id', 'metric', 'value', 'unit', 'currency', 'definition', 'dimensions', 'evidence']);
      if (typeof row.value !== 'number' || !Number.isFinite(row.value) || Math.abs(row.value) > Number.MAX_SAFE_INTEGER) invalid('finite bounded metric value required');
      const unit = text(row.unit, 128);
      if (unit === 'currency' ? typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) : row.currency !== undefined) invalid('currency code is required only for currency metrics');
      const seen = new Set(); const dimensions = array(row.dimensions, 'metric dimensions').map((dimension) => {
        fields(dimension, ['name', 'value']); const name = text(dimension.name, 128); if (seen.has(name)) invalid('duplicate metric dimension'); seen.add(name);
        return { name, value: text(dimension.value, 512) };
      });
      entry(`/details/metrics/${i}`, 'performance-metric', row, { metric: text(row.metric, 128), value: row.value, unit,
        ...(row.currency === undefined ? {} : { currency: row.currency }), definition: text(row.definition), dimensions });
    }
  }
  p.unknown('Source-attested delivery record only; requirement compliance, legal rights, external publication and metric accuracy are not internally approved.');
  return p.finish();
}
