import { join } from 'node:path';
import { constants } from 'node:fs';
import { lstat, open, readFile, writeFile, mkdir } from 'node:fs/promises';
import { FolioError } from '../errors.js';
import { listEntries, readTextOrNull, writeFileAtomic } from '../util/fs.js';
import { sha256 } from '../util/hash.js';
import { parseYaml, stringifyYaml } from '../util/yaml.js';
import { assertId, ID } from './ids.js';
import { isPlainObject } from '../util/plain.js';

export const SOURCES_DIR = 'sources';

/**
 * sources/ 가 있다면 링크가 아닌 보통 폴더여야 한다(N2 결정 17 — sources/ 밖으로 나가지 않는다).
 * lstat 으로 본다(링크를 따라가지 않음). 없으면 ok — 쓰기 쪽이 그 뒤 mkdir 로 새로 만들 수 있다.
 * @param {string} root
 */
export async function assertSourcesDirSafe(root) {
  let info;
  try {
    info = await lstat(join(root, SOURCES_DIR));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
    throw error;
  }
  if (!info.isDirectory()) throw new FolioError('SOURCES_DIR_INVALID', `${SOURCES_DIR} must be a plain directory, not a link or other entry`);
}

/** 원본 파일 이름: sources/ 바로 아래 이름만(경로 구분자·숨김 이름·NUL 안 됨, 200자까지). 설명서의 file 과 새 원본 모두 이 규칙이다. */
export const isSourceFileName = (name) => typeof name === 'string' && name.length > 0 && name.length <= 200
  && !name.includes('/') && !name.includes('\\') && !name.includes('\0') && !name.startsWith('.');

/** 글로 읽는 자료(.txt/.md): 인용을 원본 글에서 대조한다. 그 밖(PDF 등)은 설명서 spans 의 인용과 대조한다(N2 설계 §1). */
export const isTextSourceFile = (name) => /\.(txt|md)$/i.test(name);

/** @returns {NodeJS.ErrnoException} */
function notRegularFileError() {
  const error = /** @type {NodeJS.ErrnoException} */ (new Error('not a regular file'));
  error.code = 'NOT_REGULAR_FILE';
  return error;
}

/**
 * 원본 파일을 링크를 따라가지 않고 연다(N2 결정 3, 링크를 따라가지 않는다). 심볼릭 링크·하드 링크(이름이 둘 이상)나 보통 파일이 아니면
 * `NOT_REGULAR_FILE`을 던진다 — `sources/x.txt -> /etc/hosts` 같은 링크로 작품 밖 글이 새지 않게 한다.
 * 열린 손잡이에서만 읽어(경로를 다시 찾지 않음) 검사와 읽기 사이 바꿔치기를 막는다.
 * @param {string} path
 */
export async function readOriginalFile(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ELOOP' || /** @type {NodeJS.ErrnoException} */ (error).code === 'EMLINK') throw notRegularFileError();
    throw error;
  }
  try {
    const stat = await handle.stat();
    // 하드 링크(C0): 이름이 둘 이상인 파일은 작품 밖 글과 같은 파일일 수 있다. 심볼릭 링크처럼 거절한다.
    if (!stat.isFile() || stat.nlink > 1) throw notRegularFileError();
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/** 자료 설명서(yaml)를 읽고 원본 파일의 hash를 rev에 넣는다. 원본은 읽기만 한다. */
export async function readSources(root) {
  const sources = new Map();
  const errors = [];
  const warnings = [];
  try {
    await assertSourcesDirSafe(root);
  } catch (error) {
    if (error instanceof FolioError && error.code === 'SOURCES_DIR_INVALID') { errors.push({ code: 'SOURCES_DIR_INVALID' }); return { sources, errors, warnings }; }
    throw error;
  }
  for (const entry of await listEntries(join(root, SOURCES_DIR))) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
    const path = `${SOURCES_DIR}/${entry.name}`;
    const text = await readFile(join(root, path), 'utf8');
    const meta = parseYaml(text, { source: path });
    // file 은 sources/ 바로 아래 이름이어야 한다 — 설명서 한 줄로 작품 밖 파일을 읽어 오지 못하게 한다(N2 결정 3).
    if (!isPlainObject(meta) || typeof meta.id !== 'string' || !isSourceFileName(meta.file)) { errors.push({ code: 'SOURCE_META_INVALID', path }); continue; }
    let original;
    try { original = await readOriginalFile(join(root, SOURCES_DIR, meta.file)); }
    catch (error) {
      if (error.code === 'ENOENT') { errors.push({ code: 'SOURCE_FILE_MISSING', id: meta.id, file: meta.file }); continue; }
      if (error.code === 'NOT_REGULAR_FILE') { errors.push({ code: 'SOURCE_FILE_INVALID', id: meta.id, file: meta.file }); continue; }
      throw error;
    }
    if (sources.has(meta.id)) { errors.push({ code: 'DUPLICATE_SOURCE_ID', id: meta.id }); continue; }
    sources.set(meta.id, {
      id: meta.id, title: meta.title ?? '', file: meta.file, date: meta.date ?? null,
      reliability: meta.reliability ?? null, spans: Array.isArray(meta.spans) ? meta.spans : [],
      text: isTextSourceFile(meta.file) ? original.toString('utf8') : null,
      meta, path, contentHash: sha256(original), rev: sha256(`${text}\u0000${sha256(original)}`),
    });
  }
  return { sources, errors, warnings };
}

/** 설명서 쓰기 경로는 sources/<자료 id 규칙 이름>.yaml 모양만 받는다 — 서버 금지 목록의 쓰기 표면을 이 모양으로 닫는다. */
export async function writeSourceMeta(root, source) {
  assertId(source.id, 'source.id');
  const path = source.path ?? `${SOURCES_DIR}/${source.id}.yaml`;
  const match = typeof path === 'string' ? new RegExp(`^${SOURCES_DIR}/([^/]+)\\.yaml$`).exec(path) : null;
  if (!match || !ID.test(match[1])) throw new FolioError('PATH_INVALID', `source.path: ${path}`);
  await assertSourcesDirSafe(root);
  await writeFileAtomic(join(root, path), stringifyYaml(source.meta));
}

/** 새 원본 파일만 넣을 수 있다. 같은 이름이 있으면 거부한다(원본 불변). */
export async function addSourceFile(root, name, bytes) {
  if (!isSourceFileName(name)) throw new FolioError('SOURCE_NAME_INVALID', String(name).slice(0, 200));
  await assertSourcesDirSafe(root);
  const path = join(root, SOURCES_DIR, name);
  if ((await readTextOrNull(path)) !== null) throw new FolioError('SOURCE_IMMUTABLE', `${name} already exists`);
  await mkdir(join(root, SOURCES_DIR), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    // 댕글링 링크 등 읽을 수 없지만 이름은 이미 차 있는 경우: wx 가 EEXIST 를 던진다. 짐작하지 않고 "이미 있다"로만 알린다(원본 불변).
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') throw new FolioError('SOURCE_EXISTS', `${name} already exists`);
    throw error;
  }
}
