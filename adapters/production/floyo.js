import { createVersionedExportAdapter } from './versioned-export.js';
export const FLOYO_SCHEMA_SOURCE = 'https://docs.floyo.ai/floyo-api-quick-start';
export const FLOYO_SCHEMA_CHECKED = '2026-10-22';
/** UI workflow and bare execution graph remain separate user-labelled exports. No Floyo API is called. */
export const createFloyoExportAdapter = (options = {}) => createVersionedExportAdapter({ ...options,
  provider: 'floyo', bundleType: 'workflow', requiredRoles: ['editable-workflow', 'execution-graph'] });
