import { syntheticPng } from './synthetic-media.js';

/** Synthetic broker payloads; no provider export or executable game is claimed. */
export function syntheticProjectFiles() {
  const frame = (x, duration) => ({ frame: { x, y: 0, w: 8, h: 8 }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, duration });
  const rows = [
    ['code', 'src/game.js', 'source', 'text/javascript', '// Synthetic source, not executed'],
    ['lock', 'package-lock.json', 'lockfile', 'application/json', { name: 'synthetic', lockfileVersion: 3, packages: {} }],
    ['scene', 'scenes/start.json', 'scene', 'application/json', { name: 'Synthetic scene', atlas: 'sprites/idle.json' }],
    ['atlas', 'sprites/idle.json', 'sprite-atlas', 'application/json', { frames: [{ filename: 'idle-0', ...frame(0, 80) }, { filename: 'idle-1', ...frame(8, 120) }],
      meta: { image: 'idle.png', size: { w: 16, h: 16 }, scale: '1', frameTags: [{ name: 'idle', from: 0, to: 1, direction: 'forward' }] } }],
    ['sheet', 'sprites/idle.png', 'sprite-sheet', 'image/png', syntheticPng()],
    ['schema', 'db/schema.sql', 'db-schema', 'text/plain', 'CREATE TABLE synthetic_world (id INTEGER);'],
    ['migration', 'db/001.sql', 'db-migration', 'text/plain', 'ALTER TABLE synthetic_world ADD COLUMN label TEXT;'],
    ['database', 'db/snapshot.json', 'db-snapshot', 'application/json', { rows: [{ id: 1, label: 'Synthetic world' }] }],
    ['environment', 'environment.json', 'environment', 'application/json', { variableNames: ['WORLD_ID'], runtime: 'synthetic' }],
    ['deployment', 'deployment.json', 'deployment', 'application/json', { build: 'dist/game.js', platform: 'synthetic', origin: 'https://example.invalid' }],
    ['build', 'dist/game.js', 'build', 'text/javascript', '// Synthetic build evidence, not executed'],
    ['opaque', 'vendor/unknown.data', 'vendor-payload', 'application/x-synthetic-partner', Buffer.from([0, 255, 7, 31, 128])],
  ];
  const files = rows.map(([artifactKey, relativePath, role, mediaType, value]) => ({ artifactKey, relativePath, role, mediaType, required: true,
    bytes: Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) }));
  const manifest = { version: 1, files: files.map((file) => ({ path: file.relativePath, role: file.role, required: file.required })),
    entrypoints: ['src/game.js'], dependencies: [
      { from: 'src/game.js', to: 'scenes/start.json', kind: 'scene' }, { from: 'scenes/start.json', to: 'sprites/idle.json', kind: 'atlas' },
      { from: 'sprites/idle.json', to: 'sprites/idle.png', kind: 'sheet' }, { from: 'db/snapshot.json', to: 'db/001.sql', kind: 'migration' },
      { from: 'db/001.sql', to: 'db/schema.sql', kind: 'schema' }, { from: 'dist/game.js', to: 'src/game.js', kind: 'build-input' },
      { from: 'dist/game.js', to: 'package-lock.json', kind: 'lockfile' }, { from: 'deployment.json', to: 'dist/game.js', kind: 'build' },
      { from: 'deployment.json', to: 'environment.json', kind: 'environment' }],
    externalStates: [
      { id: 'world-db', kind: 'database', required: true, evidence: ['db/schema.sql', 'db/001.sql', 'db/snapshot.json'], unavailable: [] },
      { id: 'runtime', kind: 'environment', required: true, evidence: ['environment.json'], unavailable: [] },
      { id: 'host', kind: 'deployment', required: true, evidence: ['deployment.json', 'dist/game.js'], unavailable: [] }],
  };
  return [...files, { artifactKey: 'manifest', relativePath: 'project.json', role: 'project-manifest', mediaType: 'application/json', required: true, bytes: Buffer.from(JSON.stringify(manifest)) }];
}
