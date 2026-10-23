import { createVersionedExportAdapter } from './versioned-export.js';
/** Source, materials and build are captured files; remote services are outside the export's preservation claim. */
export const createGameExportAdapter = (options = {}) => createVersionedExportAdapter({ ...options,
  provider: 'game', bundleType: 'game-project', requiredRoles: ['source', 'material', 'build'],
  externalMissing: [{ role: 'database-state', required: false, reason: 'External database state was not captured' },
    { role: 'platform-state', required: false, reason: 'Deployment platform state was not captured' }] });
