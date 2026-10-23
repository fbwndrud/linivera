import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialLanguage, LANGUAGE_KEY, saveLanguage } from '../src/i18n/locale.js';
import { translate } from '../src/i18n/translate.js';
import { korean } from '../src/i18n/catalog.js';
import { checkTitle, setTitle, setDescription } from '../src/lib/check-labels.js';

const ko = (key, values) => translate(key, 'ko', values);

test('explicit language wins, supported browser languages are detected, unknown languages fall back to English', () => {
  assert.equal(initialLanguage({ getItem: () => 'en' }, ['ko-KR']), 'en');
  assert.equal(initialLanguage({ getItem: () => 'ko' }, ['en-US']), 'ko');
  assert.equal(initialLanguage(null, ['fr-FR', 'ko-KR']), 'ko');
  assert.equal(initialLanguage(null, ['en-US', 'ko-KR']), 'en');
  assert.equal(initialLanguage({ getItem: () => 'fr' }, ['de-DE']), 'en');
});
test('language selection tolerates blocked storage and never stores unsupported choices', () => {
  const writes = []; const storage = { setItem: (...args) => writes.push(args) };
  saveLanguage(storage, 'ko'); saveLanguage(storage, 'fr');
  assert.deepEqual(writes, [[LANGUAGE_KEY, 'ko']]);
  assert.doesNotThrow(() => saveLanguage({ setItem() { throw Error('blocked'); } }, 'en'));
  assert.equal(initialLanguage({ getItem() { throw Error('blocked'); } }, ['ko']), 'ko');
});
test('interpolation is literal, English remains available, and missing messages have a safe fallback', () => {
  assert.equal(ko('{count} sections need attention', { count: 2 }), '확인이 필요한 구간 2개');
  assert.equal(translate('{count} sections need attention', 'en', { count: 2 }), '2 sections need attention');
  assert.equal(ko('missing {item}', { item: '$& <script>' }), 'missing $& <script>');
  assert.equal(ko('toString'), 'toString'); assert.equal(ko(undefined), undefined);
  assert.equal(ko('unknown {value}'), 'unknown {value}');
});
test('every Korean message preserves the same interpolation fields as its English key', () => {
  const tokens = (value) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]).sort();
  for (const [key, value] of Object.entries(korean)) assert.deepEqual(tokens(value), tokens(key), key);
});
test('all literal UI translation keys have a Korean entry', async () => {
  const keys = new Set();
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name, directory);
      if (entry.isDirectory()) { path.pathname += '/'; await scan(path); }
      else if (entry.name.endsWith('.jsx')) {
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
          keys.add(match[1].startsWith('"') ? JSON.parse(match[1]) : match[1].slice(1, -1));
        }
      }
    }
  }
  await scan(new URL('../src/', import.meta.url));
  assert.ok(keys.size > 400);
  for (const key of keys) assert.ok(Object.hasOwn(korean, key), key);
});
test('built-in checks translate while user-authored names and descriptions remain intact', () => {
  assert.equal(checkTitle('novel.fixed-facts', 'custom override', ko), '확정된 사실');
  assert.equal(checkTitle('custom.rule', 'Settings', ko), 'Settings');
  assert.equal(setTitle('custom.group', 'Review', ko), 'Review');
  assert.equal(setDescription('custom.group', 'Must fix', ko), 'Must fix');
});

let server, Provider;
before(async () => {
  server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom' });
  ({ I18nProvider: Provider } = await server.ssrLoadModule('/src/i18n/context.jsx'));
});
after(async () => { await server?.close(); });
const render = (component, props, language = 'ko') => renderToStaticMarkup(React.createElement(Provider, { initialLocale: language }, React.createElement(component, props)));

test('localized check cards preserve required hard checks, custom rules and technical identifiers', async () => {
  const { CheckGroupsContent } = await server.ssrLoadModule('/src/screens/CheckSets.jsx');
  const data = { sets: [{ id: 'custom', title: 'Review', description: 'My literal Settings', selected: true, checks: ['required'] }], recommended: [], checks: [{ id: 'novel.fixed-facts', stage: 'facts', tier: 'deterministic', severity: 'hard', locked: true, sets: [], experimental: true }], chosenBy: 'work.yaml' };
  const html = render(CheckGroupsContent, { data });
  for (const text of ['검사 그룹', '확정된 사실', '항상 필수', '반드시 수정', '일관성 검사', '자동 검사', 'Review', 'My literal Settings']) assert.ok(html.includes(text), text);
  assert.ok(render(CheckGroupsContent, { data }, 'en').includes('Always required'));
});
test('structured custom strings and field names are not translated; system headings and boolean/null labels are', async () => {
  const { StructuredValue } = await server.ssrLoadModule('/src/components/StructuredValue.jsx');
  const html = render(StructuredValue, { value: { unknown: null, name: 'Review', count: 0, allowed: false } });
  for (const text of ['Unknown', 'Review', '>0<', '아니요', '기록 없음']) assert.ok(html.includes(text), text);
  const system = render(StructuredValue, { value: { revisionId: 'sha256:exact', reviewRequired: true }, systemLabels: true });
  for (const text of ['버전', 'sha256:exact', '재검토 필요', '예']) assert.ok(system.includes(text), text);
});
test('localized timeline keeps event classes, author names and original IDs; errors keep their codes and messages', async () => {
  const { ThreadTimeline } = await server.ssrLoadModule('/src/components/ThreadTimeline.jsx');
  const html = render(ThreadTimeline, { leaves: [{ id: 'scene', title: 'Review' }], promises: [{ entityId: 'thread', name: 'Settings', marks: [{ nodeId: 'scene', eventId: 'event', stage: 'planted' }] }] });
  for (const text of ['이야기 흐름', '도입', 'Settings', 'Review', 'stage-planted', '#/read/scene']) assert.ok(html.includes(text), text);
  const { LoadState } = await server.ssrLoadModule('/src/components/Status.jsx');
  const error = render(LoadState, { state: { error: { code: 'UNAUTHORIZED', message: 'Original diagnostic' } } });
  assert.match(error, /보기 세션이 만료/); assert.match(error, /UNAUTHORIZED/); assert.match(error, /Original diagnostic/);
});

test('example instructions work in both languages and retain commands and approval disclosures', async () => {
  const { Examples } = await server.ssrLoadModule('/src/screens/Examples.jsx');
  const html = render(Examples, {});
  for (const text of ['예시 모음', '모의 승인을', '작품 예시', 'node serve.mjs', 'npx -y https://github.com/fbwndrud/linivera/releases/download/v0.1.3/linivera-0.1.3.tgz examples all --language ko', 'work 폴더']) {
    assert.ok(html.includes(text), text);
  }
  assert.match(render(Examples, {}, 'en'), /Small examples included with Linivera/);
  const { exampleApproval, exampleMetadata } = await server.ssrLoadModule('/src/components/ExampleNotice.jsx');
  assert.equal(exampleApproval({ getElementById: () => ({ textContent: '{"approval":"simulated"}' }) }), 'simulated');
  assert.equal(exampleApproval({ getElementById: () => ({ textContent: '{"approval":"approved"}' }) }), null);
  assert.equal(exampleApproval({ getElementById: () => ({ textContent: 'broken' }) }), null);
  assert.equal(exampleMetadata({ getElementById: () => ({ textContent: '{"approval":"simulated","readingVariant":"en","studioVariant":"main"}' }) }).readingVariant, 'en');
  assert.match(ko('Web and EPUB use the translation. Studio shows the original main manuscript; a variant selector is not available yet.'), /판본 선택기/);
});
