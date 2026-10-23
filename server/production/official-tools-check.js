import { assertToolArguments } from './official-tools-schema.js';
import { assertOfficialSpec, assertOfficialDiscovery, officialResult } from './official-tools-contract.js';

const kinds = ['installation', 'exposure', 'authentication', 'permission', 'plan', 'credits'];
const states = ['passed', 'blocked', 'unknown', 'partial', 'expired'];
const bases = ['read-only-host-probe', 'host-tool-metadata', 'user-declaration', 'synthetic-fixture'];
const reasons = ['verified', 'not-installed', 'not-exposed', 'not-authenticated', 'permission-denied', 'plan-required',
  'credits-unconfirmed', 'credits-insufficient', 'expired', 'partial-check', 'not-checked', 'declared-only', 'not-applicable'];

/** Read-only host discovery and account probe. Never returns raw balance, errors or tool metadata. */
export async function inspectOfficialToolConnection({ tools, accessSpec, probe = async () => [] }) {
  assertOfficialSpec(accessSpec);
  let checks = kinds.map((kind) => ({ kind, status: 'unknown', basis: 'read-only-host-probe', reasonCode: 'not-checked' }));
  try {
    const supplied = await probe();
    checks = checks.map((fallback) => {
      const matches = Array.isArray(supplied) ? supplied.filter((item) => item?.kind === fallback.kind) : [];
      const item = matches[0];
      if (matches.length !== 1 || !states.includes(item.status) || !bases.includes(item.basis) || !reasons.includes(item.reasonCode)) return fallback;
      // Explicit declarations cannot establish observed credentials or entitlements.
      if (item.basis === 'user-declaration' && item.status === 'passed') return { ...fallback, basis: item.basis, reasonCode: 'declared-only' };
      return { kind: fallback.kind, status: item.status, basis: item.basis, reasonCode: item.reasonCode };
    });
  } catch { /* Raw host errors may include credentials. */ }
  const set = (kind, status, reasonCode) => {
    checks = checks.map((item) => item.kind === kind ? { kind, status, basis: 'host-tool-metadata', reasonCode } : item);
  };
  let schemas;
  try {
    schemas = assertOfficialDiscovery(await tools.list(), accessSpec.toolContract);
    set('exposure', 'passed', 'verified');
  } catch { set('exposure', 'blocked', 'not-exposed'); return checks; }
  // Discovery proves neither authentication nor usable feature credits.
  try {
    assertToolArguments(schemas.balance, { response_format: 'json' });
    const result = officialResult(await tools.call(accessSpec.toolContract.tools.balance, { response_format: 'json' }));
    if (typeof result.balance !== 'number' || !Number.isFinite(result.balance)) set('credits', 'unknown', 'credits-unconfirmed');
    else if (result.balance <= 0) set('credits', 'blocked', 'credits-insufficient');
  } catch { set('credits', 'unknown', 'credits-unconfirmed'); }
  return checks;
}
