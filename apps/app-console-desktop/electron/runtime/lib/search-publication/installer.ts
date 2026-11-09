import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { z } from 'zod';
import type { SearchPublicationGame, SearchPublicationManifest, SearchPublicationPackage } from '@tcg-cards/model/search/publication';
import { LOCAL_SEARCH_SCHEMA_VERSIONS, searchPublicationManifest, validateSearchPublicationLocales } from '@tcg-cards/model/search/publication';

import { inspectLocalSearchPackage } from '../local-search-sqlite';
import type { LocalSearchPackageMetadata } from '../local-search-sqlite';
import { computeSearchReleaseHash, sha256File } from './manifest';

const activePackageFile = z.strictObject({
  game:          z.enum(['magic', 'hearthstone']),
  locale:        z.string().min(1),
  dataVersion:   z.string().min(1),
  schemaVersion: z.number().int().positive(),
  releaseHash:   z.string().regex(/^[a-f0-9]{64}$/),
  baseSha256:    z.string().regex(/^[a-f0-9]{64}$/),
  localeSha256:  z.string().regex(/^[a-f0-9]{64}$/),
  manifest:      searchPublicationManifest,
});

type ActivePackage = z.infer<typeof activePackageFile>;

export type InstalledLocalSearchPackages = {
  game:          SearchPublicationGame;
  locale:        string;
  dataVersion:   string;
  schemaVersion: number;
  releaseHash:   string;
  basePath:      string;
  localePath:    string;
  manifest:      SearchPublicationManifest;
};

/** Downloads and verifies a manifest's base+locale pair before changing the active pointer. */
export async function updateLocalSearchPackages(input: {
  game:        SearchPublicationGame;
  locale:      string;
  storageRoot: string;
  fetcher?:    typeof fetch;
}): Promise<InstalledLocalSearchPackages> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`https://data.tcg.cards/search/${input.game}/manifest.json`);
  if (!response.ok) throw new Error(`Search manifest request failed with HTTP ${response.status}.`);
  const manifest = validateSearchPublicationLocales(searchPublicationManifest.parse(await response.json()));
  if (manifest.game !== input.game) throw new Error('The search manifest belongs to another game.');
  if (manifest.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[input.game]) {
    throw new Error('The search manifest uses an unsupported local search schema.');
  }
  if (computeSearchReleaseHash(manifest) !== manifest.releaseHash) {
    throw new Error('The search manifest release hash does not match its contents.');
  }
  const base = manifest.packages.find((item): item is Extract<SearchPublicationPackage, { role: 'base' }> => item.role === 'base');
  const localePackage = manifest.packages.find((item): item is Extract<SearchPublicationPackage, { role: 'locale' }> =>
    item.role === 'locale' && item.locale === input.locale);
  if (base == null || localePackage == null) throw new Error('The search manifest has no package for the selected language.');

  const gameRoot = resolve(input.storageRoot, input.game);
  await mkdir(join(gameRoot, 'objects'), { recursive: true });
  const basePath = await installPackage(fetcher, gameRoot, base, manifest);
  const localePath = await installPackage(fetcher, gameRoot, localePackage, manifest);

  const active = {
    game:          input.game,
    locale:        input.locale,
    dataVersion:   manifest.dataVersion,
    schemaVersion: manifest.schemaVersion,
    releaseHash:   manifest.releaseHash,
    baseSha256:    base.sha256,
    localeSha256:  localePackage.sha256,
    manifest,
  };
  const activePath = join(gameRoot, 'active.json');
  const temporaryPointer = `${activePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPointer, `${JSON.stringify(active, null, 2)}\n`, { flag: 'wx' });
  await rename(temporaryPointer, activePath);

  return { ...active, basePath, localePath };
}

/** Resolves the current pointer and ensures it still identifies the requested package pair. */
export async function readInstalledLocalSearchPackages(input: {
  game:        SearchPublicationGame;
  locale:      string;
  storageRoot: string;
}): Promise<InstalledLocalSearchPackages | null> {
  const gameRoot = resolve(input.storageRoot, input.game);
  let active: ActivePackage;
  try {
    active = activePackageFile.parse(JSON.parse(await readFile(join(gameRoot, 'active.json'), 'utf8')));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const manifest = validateSearchPublicationLocales(searchPublicationManifest.parse(active.manifest));
  if (active.game !== input.game || manifest.game !== input.game || active.locale !== input.locale) return null;
  if (active.dataVersion !== manifest.dataVersion || active.schemaVersion !== manifest.schemaVersion
    || active.releaseHash !== manifest.releaseHash || computeSearchReleaseHash(manifest) !== active.releaseHash) {
    throw new Error('The installed search package pointer does not match its release manifest.');
  }

  const base = manifest.packages.find((item): item is Extract<SearchPublicationPackage, { role: 'base' }> => item.role === 'base');
  const localePackage = manifest.packages.find((item): item is Extract<SearchPublicationPackage, { role: 'locale' }> =>
    item.role === 'locale' && item.locale === input.locale);
  if (base == null || localePackage == null
    || active.baseSha256 !== base.sha256 || active.localeSha256 !== localePackage.sha256) {
    throw new Error('The installed search package pointer does not match the selected language.');
  }
  const basePath = objectPath(gameRoot, base.sha256);
  const localePath = objectPath(gameRoot, localePackage.sha256);
  await validatePackagePath(basePath, manifest, base);
  await validatePackagePath(localePath, manifest, localePackage);
  return { ...active, basePath, localePath };
}

async function installPackage(
  fetcher: typeof fetch,
  gameRoot: string,
  descriptor: SearchPublicationPackage,
  manifest: SearchPublicationManifest,
): Promise<string> {
  const target = objectPath(gameRoot, descriptor.sha256);
  try {
    await validatePackagePath(target, manifest, descriptor);
    return target;
  } catch {
    // Keep an invalid cached file in place until the verified replacement is ready.
  }

  const temporary = `${target}.${randomUUID()}.part`;
  try {
    const response = await fetcher(`https://data.tcg.cards${descriptor.key}`);
    if (!response.ok) throw new Error(`Search package download failed with HTTP ${response.status}.`);
    const declaredLength = response.headers.get('content-length');
    if (declaredLength != null && Number(declaredLength) !== descriptor.bytes) {
      throw new Error('The downloaded search package length does not match the manifest.');
    }
    if (response.body == null) throw new Error('The search package response has no body.');
    let received = 0;
    const countBytes = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      countBytes,
      createWriteStream(temporary, { flags: 'wx' }),
    );
    if (received !== descriptor.bytes || await sha256File(temporary) !== descriptor.sha256) {
      throw new Error('The downloaded search package failed its length or SHA-256 check.');
    }
    await validatePackagePath(temporary, manifest, descriptor);
    await rename(temporary, target);
    return target;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function validatePackagePath(
  path: string,
  manifest: SearchPublicationManifest,
  descriptor: SearchPublicationPackage,
): Promise<LocalSearchPackageMetadata> {
  const [metadata, file, digest] = await Promise.all([
    inspectLocalSearchPackage({ game: manifest.game, path }),
    stat(path),
    sha256File(path),
  ]);
  const locale = descriptor.role === 'locale' ? descriptor.locale : null;
  const buildMatches = manifest.game === 'magic'
    || metadata.buildNumber === manifest.buildNumber;
  if (file.size !== descriptor.bytes || digest !== descriptor.sha256
    || metadata.packageRole !== descriptor.role
    || metadata.locale !== locale
    || metadata.dataVersion !== manifest.dataVersion
    || metadata.schemaVersion !== manifest.schemaVersion
    || metadata.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[manifest.game]
    || !buildMatches) {
    throw new Error('The local search package identity does not match the active manifest.');
  }
  return metadata;
}

function objectPath(gameRoot: string, digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('The local search object digest is invalid.');
  return join(gameRoot, 'objects', `${digest}.sqlite`);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
