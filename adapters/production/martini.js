import { createVersionedExportAdapter } from './versioned-export.js';
export const MARTINI_SCHEMA_SOURCE = 'https://www.martini.film/docs/workflows';
export const MARTINI_SCHEMA_CHECKED = '2026-10-22';
/** Raw workflow/run exports preserve item states and replacement references; supplier verdicts are observations. */
export const createMartiniExportAdapter = (options = {}) => createVersionedExportAdapter({ ...options,
  provider: 'martini', bundleType: 'workflow-run', requiredRoles: ['workflow-source', 'run-record'] });
