import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256 } from '../../core/util/hash.js';

/** Only a temporary code installation changes; fixtures and the repository remain untouched. */
export async function copyCatalogInstallation(t) {
  const repo = join(import.meta.dirname, '../..');
  const installed = await mkdtemp(join(tmpdir(), 'linivera-catalog-upgrade-'));
  t.after(() => rm(installed, { recursive: true, force: true }));
  for (const path of ['core', 'adapters', 'packs', 'server', 'bin', 'examples', 'skill', 'package.json']) await cp(join(repo, path), join(installed, path), { recursive: true });
  await symlink(await realpath(join(repo, 'node_modules')), join(installed, 'node_modules'), 'dir');
  return installed;
}
async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  assert.equal(source.split(before).length, 2, 'synthetic upgrade needs one exact catalog seam');
  await writeFile(path, source.replace(before, after));
}
export async function appendCatalogEditions(installed, capability, access) {
  for (const [name, value] of [['capability', capability], ['access', access]]) {
    await replaceOnce(join(installed, 'packs/production', name + '-catalog.js'), '];\nfunction freeze',
      JSON.stringify(value) + '];\nfunction freeze');
  }
  const hash = (value) => sha256(canonicalJson(value));
  await writeFile(join(installed, 'packs/production/catalog-release-v2.js'),
    `export const capabilityReleaseV2 = Object.freeze(${JSON.stringify({ [capability.id]: hash(capability) })});\n`
    + `export const accessReleaseV2 = Object.freeze(${JSON.stringify({ [access.id]: hash(access) })});\n`);
  const releases = join(installed, 'packs/production/catalog-releases.js');
  await writeFile(releases, "import { capabilityReleaseV2, accessReleaseV2 } from './catalog-release-v2.js';\n" + await readFile(releases, 'utf8'));
  await replaceOnce(releases, '[capabilityReleaseV1]', '[capabilityReleaseV1, capabilityReleaseV2]');
  await replaceOnce(releases, '[accessReleaseV1]', '[accessReleaseV1, accessReleaseV2]');
}
