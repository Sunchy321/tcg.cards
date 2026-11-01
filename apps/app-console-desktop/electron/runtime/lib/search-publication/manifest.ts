import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import type { SearchPublicationGame, SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import { searchPublicationManifest, searchReleaseIdentityJson, validateSearchPublicationLocales } from '@tcg-cards/model/search/publication';

export type SearchPackageInput
  = | { role: 'base', path: string }
    | { role: 'locale', locale: string, path: string };

export type SearchPackageFile = {
  key:    string;
  path:   string;
  sha256: string;
  bytes:  number;
};

export type SearchPublicationInput = {
  game:          SearchPublicationGame;
  dataVersion:   string;
  schemaVersion: number;
  pgFingerprint: string;
  packages:      SearchPackageInput[];
  generatedAt?:  Date;
} & (
  | { game: 'magic', typeSymbols: string[], tagOwners: Record<string, 'card-only' | 'print-only' | 'overlap'> }
  | { game: 'hearthstone', buildNumber: number }
);

/** Hashes a canonical release description whose identity is independent of its display timestamp. */
export async function createSearchPublicationManifest(
  input: SearchPublicationInput,
): Promise<SearchPublicationManifest> {
  const packages = await Promise.all(input.packages.map(async item => {
    const [digest, file] = await Promise.all([sha256File(item.path), stat(item.path)]);
    const common = {
      key:    `/search/${input.game}/objects/${digest}.sqlite`,
      sha256: digest,
      bytes:  file.size,
    };
    return item.role === 'base'
      ? { role: 'base' as const, ...common }
      : { role: 'locale' as const, locale: item.locale, ...common };
  }));
  packages.sort((left, right) => left.role === right.role
    ? (left.role === 'base' ? 0 : right.role === 'base' ? 0 : compareText(left.locale, right.locale))
    : left.role === 'base' ? -1 : 1);

  const { generatedAt: _generatedAt, packages: _paths, ...releaseMetadata } = input;
  const candidate = searchPublicationManifest.parse({
    ...releaseMetadata,
    manifestVersion: 1,
    releaseHash:     '0'.repeat(64),
    generatedAt:     (input.generatedAt ?? new Date()).toISOString(),
    packages,
  });
  const releaseHash = sha256Text(searchReleaseIdentityJson(candidate));
  const manifest = searchPublicationManifest.parse({ ...candidate, releaseHash });
  return validateSearchPublicationLocales(manifest);
}

/** Recomputes the release identity from a downloaded manifest without its display timestamp. */
export function computeSearchReleaseHash(manifest: SearchPublicationManifest): string {
  return sha256Text(searchReleaseIdentityJson(manifest));
}

/** Streams a package file so hashing does not copy a large SQLite database into memory. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Hashes a UTF-8 release identity using SHA-256. */
function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Orders locale names without depending on the host's default language. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
