import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { FolioError } from '../errors.js';
import { listEntries, writeFileAtomic } from '../util/fs.js';
import { sha256 } from '../util/hash.js';
import { parseYaml, stringifyYaml } from '../util/yaml.js';
import { assertId, assertSafePath } from './ids.js';
import { assertAssetDirs } from '../assets/files.js';
import { readManagedAssets } from '../assets/records.js';
import { isPlainObject } from '../util/plain.js';

export const ASSETS_DIR = 'assets';
const INLINE = /!\[\[asset:([A-Za-z0-9][\w-]*)\]\]/g;

// 없는 것과 같이 다룬다: 자리에 아무것도 없거나(ENOENT), 지나는 자리가 파일이라 못 들어가거나(ENOTDIR),
// 이름이 너무 길어(ENAMETOOLONG) 애초에 만들어질 수 없는 경로다.
const HASH_MISSING_CODES = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);
// 보통 파일이 아닌 것과 같이 다룬다: 소켓(ENXIO/EOPNOTSUPP — OS 마다 다르다)이나 심볼릭 링크 고리(ELOOP).
const HASH_NOT_REGULAR_CODES = new Set(['ENXIO', 'EOPNOTSUPP', 'ELOOP']);

export const assetRefsInBody = (body) => [...String(body).matchAll(INLINE)].map((match) => match[1]);

/**
 * 그림 파일 내용의 hash. 먼저 stat 으로 보통 파일인지만 본다 — 소켓·장치·폴더·심볼릭 링크 고리는 열지 않고 바로
 * notFile 로 끝낸다(장치를 결코 열지 않는다). 보통 파일이면 O_NONBLOCK 으로 열어 FIFO 로 바뀌어도 멈추지 않고,
 * 연 손잡이의 fstat 으로 다시 한 번 본다(첫 stat 과 여는 사이 바꿔치기 없음). 경로에 NUL 바이트가 있으면 시스템
 * 호출을 아예 하지 않고 missing 으로 둔다(그런 경로는 실제로 있을 수 없다). 없으면 missing, 보통 파일이 아니면 notFile.
 * @param {string} path
 * @returns {Promise<{ hash: string } | { missing: true } | { notFile: true }>}
 */
async function fileHashOf(path) {
  if (path.includes('\0')) return { missing: true };
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (HASH_MISSING_CODES.has(error?.code)) return { missing: true };
    if (HASH_NOT_REGULAR_CODES.has(error?.code)) return { notFile: true };
    throw error;
  }
  if (!info.isFile()) return { notFile: true };
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if (HASH_MISSING_CODES.has(error?.code)) return { missing: true };
    if (error?.code === 'EISDIR' || HASH_NOT_REGULAR_CODES.has(error?.code)) return { notFile: true };
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) return { notFile: true };
    return { hash: sha256(await handle.readFile()) };
  } finally {
    await handle.close();
  }
}

/**
 * 그림 설명서(yaml). 이미지 파일이 없으면 경고만 한다(생성 전 상태가 정상일 수 있음). 파일 자리가 폴더·FIFO 같은
 * 보통 파일이 아닌 것이어도 작품 열기를 막지 않고 경고(ASSET_FILE_NOT_REGULAR)만 한다.
 * hashFiles: false 면 이미지 파일을 읽지 않는다(rev 는 null) — 설명서만 필요한 곳(뷰어 그림 요청)이 요청마다 모든 그림을 다시 읽지 않게.
 * @param {string} root
 * @param {{ hashFiles?: boolean, entities?: Map<string, any> }} [options]
 */
export async function readAssets(root, { hashFiles = true, entities = null } = {}) {
  const assets = new Map();
  const errors = [];
  const warnings = [];
  try { await assertAssetDirs(root); }
  catch (error) { return { assets, errors: [{ code: error.code }], warnings }; }
  for (const entry of await listEntries(join(root, ASSETS_DIR))) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
    const path = `${ASSETS_DIR}/${entry.name}`;
    const text = await readFile(join(root, path), 'utf8');
    const meta = parseYaml(text, { source: path });
    if (typeof meta.id !== 'string') { errors.push({ code: 'ASSET_META_INVALID', path }); continue; }
    let fileHash = null;
    if (hashFiles && typeof meta.file === 'string') {
      const found = await fileHashOf(join(root, ASSETS_DIR, meta.file));
      if ('hash' in found) fileHash = found.hash;
      else warnings.push({ code: 'missing' in found ? 'ASSET_FILE_MISSING' : 'ASSET_FILE_NOT_REGULAR', id: meta.id, file: meta.file });
    }
    const brief = isPlainObject(meta.brief) ? meta.brief : {};
    if (assets.has(meta.id)) { errors.push({ code: 'DUPLICATE_ASSET_ID', id: meta.id }); continue; }
    assets.set(meta.id, {
      id: meta.id, file: meta.file ?? null, brief,
      entities: Array.isArray(brief.entities) ? brief.entities.filter((e) => typeof e === 'string') : [],
      meta, path, rev: hashFiles ? sha256(`${text}\u0000${fileHash ?? ''}`) : null, metaText: text,
    });
  }
  try {
    const managed = await readManagedAssets(root, entities);
    for (const [id, asset] of managed.assets) {
      if (assets.has(id)) { errors.push({ code: 'DUPLICATE_ASSET_ID', id }); continue; }
      assets.set(id, asset);
      if (['content_changed', 'content_missing'].includes(asset.status)) warnings.push({ code: 'ASSET_CONTENT_CHANGED', id, status: asset.status });
    }
  } catch (error) { errors.push({ code: error.code ?? 'ASSET_RECORD_INVALID', message: error.message }); }
  return { assets, errors, warnings };
}

export async function writeAssetMeta(root, asset) {
  assertId(asset.id, 'asset.id');
  assertSafePath(asset.path, 'asset.path');
  await writeFileAtomic(join(root, asset.path ?? `${ASSETS_DIR}/${asset.id}.yaml`), stringifyYaml(asset.meta));
}

/**
 * assets/ 가 있다면 링크가 아닌 보통 폴더여야 한다(그림 쓰기가 작품 밖으로 나가지 않는다 — 자료의 sources/ 규칙과 같다).
 * lstat 으로 본다(링크를 따라가지 않음). 없으면 ok — 쓰기 쪽이 그 뒤 mkdir 로 새로 만든다.
 * @param {string} root
 */
export async function assertAssetsDirSafe(root) {
  let info;
  try { info = await lstat(join(root, ASSETS_DIR)); } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return;
    throw error;
  }
  if (!info.isDirectory()) throw new FolioError('ASSETS_DIR_INVALID', `${ASSETS_DIR} must be a plain directory, not a link or other entry`);
}

/** 그림 실행이 쓰는 이름: assets/ 바로 아래, 작품 id 규칙 + 그림·설명서 확장자. 경로 조각·숨김 이름은 만들 수 없다. */
export const ASSET_WRITE_NAME = /^[a-z0-9][a-z0-9-]*\.(png|jpg|gif|webp|svg|yaml)$/;

/** 링크를 따라가지 않고 보통 파일만 읽는다. 그 밖이면 null. */
async function readRegularOrNull(path) {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch { return null; }
  try { return (await handle.stat()).isFile() ? await handle.readFile() : null; } finally { await handle.close(); }
}

/**
 * assets/<name> 을 딱 한 번만 쓴다: 같은 폴더의 임시 파일에 쓰고 link 로 옮긴다(이미 있으면 EEXIST — 덮지 않고, 반쯤 쓴 파일도 남지 않는다).
 * 이미 있으면 내용이 같을 때만 통과한다(이어서 커밋하는 길, written: false). 다르거나 링크·보통 파일이 아니면 ASSET_IMMUTABLE.
 * @param {string} root
 * @param {string} name
 * @param {Uint8Array|string} bytes
 * @returns {Promise<{ written: boolean }>}
 */
export async function writeAssetOnce(root, name, bytes) {
  if (typeof name !== 'string' || !ASSET_WRITE_NAME.test(name)) throw new FolioError('ASSET_NAME_INVALID', String(name).slice(0, 200));
  await assertAssetsDirSafe(root);
  await mkdir(join(root, ASSETS_DIR), { recursive: true });
  const target = join(root, ASSETS_DIR, name);
  const tmp = join(root, ASSETS_DIR, `.${name}.${randomUUID().slice(0, 8)}.tmp`);
  try {
    await writeFile(tmp, bytes, { flag: 'wx' });
    await link(tmp, target);
    return { written: true };
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
    const existing = await readRegularOrNull(target);
    if (existing && sha256(existing) === sha256(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes)) return { written: false };
    throw new FolioError('ASSET_IMMUTABLE', `${name} already exists with other content`, { name });
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
