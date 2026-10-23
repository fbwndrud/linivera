import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('fresh tarball without dev dependencies completes the public tracking stdio flow', () => {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [...(npmCli ? [npmCli] : []), 'run', '--silent', 'package:verify'];
  const result = spawnSync(command, args, {
    // Installation and all serial continuity examples, including the combined P0-P4 scenario.
    cwd: join(import.meta.dirname, '../..'), encoding: 'utf8', timeout: 600_000,
    shell: !npmCli && process.platform === 'win32',
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.installedFromTarball, true);
  assert.equal(output.developmentDependenciesAbsent, true);
  assert.equal(output.readinessGuards.contradictoryOutputRefused, true);
  assert.equal(output.readinessGuards.directIterationScopeRefused, true);
  assert.equal(output.readinessGuards.publishedCatalogHashesVerified, true);
  assert.equal(output.doctor.installedBinVerified, true);
  assert.equal(output.doctor.pureReadVerified, true);
  assert.equal(output.tracking.verified, true);
  assert.deepEqual(output.tracking.scenarios, ['mystery', 'cookbook', 'picturebook']);
});
