import { createVersionedExportAdapter } from './versioned-export.js';
export const RODIN_SCHEMA_SOURCE = 'https://docs.hyper3d.ai/en/api-specification/download-results';
export const RODIN_SCHEMA_CHECKED = '2026-10-22';
/** User-supplied files only. A task_uuid and a jobs.subscription_key in native evidence are not interchangeable. */
export const createRodinExportAdapter = (options = {}) => createVersionedExportAdapter({ ...options,
  provider: 'rodin', bundleType: 'model-3d', requiredRoles: ['model'] });
