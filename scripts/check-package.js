import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyPackageEntry } from './package-entry.js';
import { verifyInstalledDoctor } from './package-doctor.js';
import { verifyPackedMarkdownLinks } from './package-links.js';
import { verifyInstalledPublicationLanguages } from './package-language.js';

const repo = dirname(import.meta.dirname);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run this check with npm run package:verify');
const sandbox = await mkdtemp(join(tmpdir(), 'linivera-package-'));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, npm_config_cache: join(sandbox, 'cache') } });
  if (result.error || result.status !== 0) {
    throw new Error(`${args[0]} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return result.stdout;
}

try {
  const [packed] = JSON.parse(run(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', sandbox], repo));
  assert.ok(packed.files.some((file) => file.path === 'viewer/dist/index.html'), 'installed linivera-view needs built screens');
  assert.ok(packed.files.some((file) => file.path === 'examples/run.js'));
  assert.ok(packed.files.some((file) => file.path === 'examples/assets.js'));
  for (const path of ['adapters/embedding/index.js', 'adapters/embedding/worker.py', 'adapters/embedding/requirements.txt', 'docs/embeddings.md', 'skill/folio/references/embeddings.md', 'examples/tracking.js', 'examples/tracking-host.js', 'docs/tracking.md',
    'docs/tracking-verification.md', 'skill/folio/references/tracking.md']) {
    assert.ok(packed.files.some((file) => file.path === path), `package must include ${path}`);
  }
  assert.ok(packed.files.some((file) => file.path === 'packs/sources/checkers/claims.js'));
  assert.ok(!packed.files.some((file) => /^(test\/|docs\/plans\/|tree\/|entities\/|assets\/|\.local-output\/|\.superpowers\/)|(^|\/)\.folio\/|\.(zip|epub|png)$/.test(file.path)),
    'test data, implementation plans, work state and work outputs must stay out of the package');
  await writeFile(join(sandbox, 'package.json'), '{"name":"linivera-install-check","version":"1.0.0","private":true}\n');
  run(process.execPath, [npmCli, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', join(sandbox, packed.filename)], sandbox);
  const installed = join(sandbox, 'node_modules', packed.name);
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  const documentation = await verifyPackedMarkdownLinks({ root: installed, files: packed.files.map((file) => file.path) });
  assert.equal(manifest.name, 'linivera');
  assert.equal(manifest.bin.linivera, 'bin/linivera.js');
  assert.match(run(process.execPath, [join(installed, 'bin/linivera.js'), '--help'], sandbox), /linivera demo/);
  for (const prefix of ['linivera', 'folio']) {
    for (const command of ['mcp', 'view', 'doctor']) {
      const name = `${prefix}-${command}`;
      assert.equal(manifest.bin[name], `bin/${name}.js`);
      await access(join(sandbox, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name));
    }
  }
  assert.ok(!Object.keys(manifest.scripts).some((name) => /^(preinstall|install|postinstall|prepare)$/.test(name)));
  assert.ok(!packed.files.some((file) => /^viewer\/(?!dist\/)|\.(safetensors|gguf|pt|pth)$/.test(file.path)), 'only prepared viewer files; no model weights');
  const developmentDependenciesAbsent = (await Promise.all(Object.keys(manifest.devDependencies).flatMap((name) =>
    [sandbox, installed].map((base) => access(join(base, 'node_modules', name)).then(() => false, () => true))))).every(Boolean);
  assert.equal(developmentDependenciesAbsent, true);
  // Resolve every benchmark dependency inside the installed package, which excludes test fixtures.
  const benchmark = await import(pathToFileURL(join(installed, 'scripts/benchmark-local.js')).href);
  assert.equal(typeof benchmark.benchmarkLocal, 'function');
  const npx = await verifyPackageEntry({ npmCli, sandbox, tarball: join(sandbox, packed.filename), manifest });
  const doctor = await verifyInstalledDoctor(sandbox, installed, 'linivera');
  const legacyDoctor = await verifyInstalledDoctor(sandbox, installed, 'folio');
  const examples = JSON.parse(run(process.execPath, [join(installed, 'examples', 'run.js'), 'all', '--verify'], sandbox));
  assert.equal(examples.verified, true);
  assert.equal(examples.language, 'en');
  assert.deepEqual(examples.results.map((result) => result.example), ['story', 'guide', 'picturebook', 'fairytale']);
  const assets = JSON.parse(run(process.execPath, [join(installed, 'examples', 'assets.js')], sandbox));
  assert.equal(assets.verified, true);
  assert.equal(assets.status, 'approved');
  const continuity = JSON.parse(run(process.execPath, [join(installed, 'examples', 'production-continuity.js')], sandbox));
  for (const field of ['verified', 'serverRestarted', 'audioAligned', 'videoAudio', 'transitiveReviewRequired']) assert.equal(continuity[field], true);
  assert.equal(continuity.actualModelGeneration, false);
  const scopedContinuity = JSON.parse(run(process.execPath, [join(installed, 'examples', 'scoped-continuity.js')], sandbox));
  for (const field of ['verified', 'scopeIsolation', 'oldRevisionPreserved', 'selectionRestored', 'contextFeedsNextWork', 'videoAudio', 'transitiveReviewRequired']) assert.equal(scopedContinuity[field], true);
  assert.equal(scopedContinuity.actualModelGeneration, false);
  const structureContinuity = JSON.parse(run(process.execPath, [join(installed, 'examples', 'structure-continuity.js')], sandbox));
  for (const field of ['verified', 'serverRestarted', 'structureFeedsNextWork', 'exactDependencyClosure', 'indexedRelationsVerified', 'transitiveReviewRequired']) assert.equal(structureContinuity[field], true);
  assert.equal(structureContinuity.actualModelGeneration, false);
  for (const args of [[], ['--contract']]) {
    const timeline = JSON.parse(run(process.execPath, [join(installed, 'examples', 'timeline-continuity.js'), ...args], sandbox));
    for (const field of ['verified', 'serverRestarted', 'timelineFeedsNextWork', 'dependencyClosure', 'transitiveReviewRequired']) assert.equal(timeline[field], true);
    assert.equal(timeline.actualModelGeneration, false);
  }
  const tracking = JSON.parse(run(process.execPath, [join(installed, 'examples', 'tracking.js')], sandbox));
  for (const args of [[], ['--sheet']]) {
    const project = JSON.parse(run(process.execPath, [join(installed, 'examples', 'project-continuity.js'), ...args], sandbox));
    for (const field of ['verified', 'brokerFilesRetained', 'serverRestarted', 'projectFeedsNextWork', 'dependencyClosure', 'transitiveReviewRequired']) assert.equal(project[field], true);
    assert.equal(project.actualModelGeneration, false); assert.equal(project.actualBrokerNetwork, false); assert.equal(project.runtimeRestored, false);
  }
  assert.equal(tracking.verified, true);
  for (const change of ['rights', 'rights-proof', 'performance', 'contract']) {
    const delivery = JSON.parse(run(process.execPath, [join(installed, 'examples', 'delivery-continuity.js'), '--change=' + change], sandbox));
    for (const field of ['verified', 'serverRestarted', 'deliveryFeedsNextWork', 'exactDependencyClosure', 'releaseIdentityMatched', 'transitiveReviewRequired']) assert.equal(delivery[field], true);
    for (const field of ['actualModelGeneration', 'externalPublication', 'legalApproval']) assert.equal(delivery[field], false);
  }
  const chroma = JSON.parse(run(process.execPath, [join(installed, 'examples', 'chroma-continuity.js')], sandbox));
  for (const field of ['verified', 'singleWorkspace', 'originalsDeleted', 'bundleFeedsNextWork', 'historicalInputsVerified']) assert.equal(chroma[field], true);
  assert.ok(Object.values(chroma.refused).every(Boolean) && Object.values(chroma.reviewPropagation).every(Boolean));
  for (const field of ['actualModelGeneration', 'actualProviderNetwork', 'externalPublication', 'legalApproval']) assert.equal(chroma[field], false);
  assert.deepEqual(tracking.scenarios, ['mystery', 'cookbook', 'picturebook']);
  const production = JSON.parse(run(process.execPath, [join(installed, 'examples', 'production.js')], sandbox));
  assert.deepEqual(production.serverInfo, { name: manifest.name, version: manifest.version });
  assert.equal(production.editions.verified, true);
  for (const field of ['synthetic', 'viewerResourceVisible', 'epubVerified', 'resourceOnlyVerified', 'installedCliReady']) assert.equal(production[field], true);
  assert.equal(production.outputsRetained, false);
  const publicationLanguages = await verifyInstalledPublicationLanguages(installed, sandbox);
  console.log(JSON.stringify({ installedFromTarball: true, developmentDependenciesAbsent, npx,
    production, continuity, scopedContinuity, structureContinuity, publicationLanguages, doctor, legacyDoctor, documentation, benchmarkModuleVerified: true, entryCount: packed.entryCount, examples: examples.results.map((result) => result.example), assets, tracking }, null, 2));
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
