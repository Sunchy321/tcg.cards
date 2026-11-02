import { z } from 'zod';

import { locale as hearthstoneLocale } from '../hearthstone/schema/basic';
import { locale as magicLocale } from '../magic/schema/basic';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/** Increment only the affected game's version when its exported SQLite layout changes. */
export const LOCAL_SEARCH_SCHEMA_VERSIONS = { magic: 2, hearthstone: 1 } as const;

const objectDescriptor = z.strictObject({
  role:  z.literal('base'),
  key:   z.string().min(1),
  sha256,
  bytes: z.number().int().positive(),
}).or(z.strictObject({
  role:   z.literal('locale'),
  locale: z.string().min(1),
  key:    z.string().min(1),
  sha256,
  bytes:  z.number().int().positive(),
}));

const packageList = z.array(objectDescriptor).min(1).superRefine((packages, context) => {
  const bases = packages.filter(item => item.role === 'base');
  const locales = packages.filter(item => item.role === 'locale');
  if (bases.length !== 1) {
    context.addIssue({ code: 'custom', message: 'A search release must contain exactly one base package.' });
  }
  if (new Set(locales.map(item => item.locale)).size !== locales.length) {
    context.addIssue({ code: 'custom', message: 'A search release cannot contain duplicate locale packages.' });
  }
  for (const item of packages) {
    if (!item.key.endsWith(`/objects/${item.sha256}.sqlite`)) {
      context.addIssue({ code: 'custom', message: 'Search package keys must be addressed by their SHA-256.' });
    }
  }
});

const releaseIdentity = {
  manifestVersion: z.literal(1),
  dataVersion:     z.string().min(1),
  schemaVersion:   z.number().int().positive(),
  releaseHash:     sha256,
  pgFingerprint:   sha256,
  generatedAt:     z.iso.datetime(),
  packages:        packageList,
};

/** Fixed public description of one game's independently activated local package group. */
export const searchPublicationManifest = z.discriminatedUnion('game', [
  z.strictObject({
    ...releaseIdentity,
    game:        z.literal('magic'),
    typeSymbols: z.array(z.string()),
    tagOwners:   z.record(z.string(), z.enum(['card-only', 'print-only', 'overlap'])),
  }),
  z.strictObject({
    ...releaseIdentity,
    game:        z.literal('hearthstone'),
    buildNumber: z.number().int().positive(),
  }),
]);

/** Validates the full locale set before a release can become the fixed manifest. */
export function validateSearchPublicationLocales(
  manifest: SearchPublicationManifest,
): SearchPublicationManifest {
  const expected = manifest.game === 'magic' ? magicLocale.options : hearthstoneLocale.options;
  const actual = manifest.packages
    .filter((item): item is Extract<typeof item, { role: 'locale' }> => item.role === 'locale')
    .map(item => item.locale);
  const expectedSet = new Set<string>(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter(locale => !actualSet.has(locale));
  const unsupported = actual.filter(locale => !expectedSet.has(locale));
  if (missing.length > 0 || unsupported.length > 0 || actual.length !== expected.length) {
    throw new Error('The search package release must include each supported locale exactly once.');
  }
  const expectedPrefix = `/search/${manifest.game}/objects/`;
  if (manifest.packages.some(item => !item.key.startsWith(expectedPrefix) || !item.key.endsWith(`/${item.sha256}.sqlite`))) {
    throw new Error('The search package key does not match its game and SHA-256.');
  }
  return manifest;
}

/** Serializes the content identity shared by the package publisher, clients, and D1 exporters. */
export function searchReleaseIdentityJson(manifest: SearchPublicationManifest): string {
  const {
    generatedAt: _generatedAt,
    manifestVersion: _manifestVersion,
    releaseHash: _releaseHash,
    dataVersion: _dataVersion,
    ...identity
  } = manifest;
  return canonicalJson(identity);
}

/** Emits deterministic JSON for the plain manifest values used in release identity. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('The search release identity contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new Error('The search release identity contains a non-JSON value.');
}

export type SearchPublicationManifest = z.infer<typeof searchPublicationManifest>;
export type SearchPublicationPackage = SearchPublicationManifest['packages'][number];
export type SearchPublicationGame = SearchPublicationManifest['game'];
