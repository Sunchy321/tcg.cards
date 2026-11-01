import { resolve } from 'node:path';

import { locale as hearthstoneLocale } from '@tcg-cards/model/hearthstone/schema/basic';
import { locale as magicLocale } from '@tcg-cards/model/magic/schema/basic';
import type { SearchPublicationGame, SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';

import { inspectLocalSearchPackage } from '../local-search-sqlite';
import { createSearchPublicationManifest } from './manifest';
import type { SearchPackageFile } from './manifest';

type SharedInput = {
  game:          SearchPublicationGame;
  directory:     string;
  pgFingerprint: string;
  generatedAt?:  Date;
};

export type PrepareSearchPublicationInput = SharedInput & (
  | { game: 'magic', typeSymbols: string[], tagOwners: Record<string, 'card-only' | 'print-only' | 'overlap'> }
  | { game: 'hearthstone', buildNumber: number }
);

export type PreparedSearchPublication = {
  manifest: SearchPublicationManifest;
  files:    SearchPackageFile[];
};

/** Validates all exported SQLite files and builds one fixed-manifest candidate for a game. */
export async function prepareSearchPublication(
  input: PrepareSearchPublicationInput,
): Promise<PreparedSearchPublication> {
  const directory = resolve(input.directory);
  const locales = input.game === 'magic' ? magicLocale.options : hearthstoneLocale.options;
  const basePath = resolve(directory, `${input.game}-base.sqlite`);
  const base = inspectLocalSearchPackage({ game: input.game, path: basePath });
  assertMetadata(base, input.game, 'base', null);
  if (base.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[input.game]) {
    throw new Error('The exported search base uses a schema version unsupported by this desktop build.');
  }
  if (input.game === 'hearthstone' && base.buildNumber !== input.buildNumber) {
    throw new Error('The exported search package does not match the Hearthstone build in its publication details.');
  }

  const packageInputs: Array<{ role: 'base', path: string } | { role: 'locale', locale: string, path: string }> = [
    { role: 'base', path: basePath },
  ];
  for (const locale of locales) {
    const path = resolve(directory, `${input.game}-${locale}.sqlite`);
    const metadata = inspectLocalSearchPackage({ game: input.game, path });
    assertMetadata(metadata, input.game, 'locale', locale);
    if (metadata.dataVersion !== base.dataVersion || metadata.schemaVersion !== base.schemaVersion
      || metadata.buildNumber !== base.buildNumber) {
      throw new Error(`The ${locale} search package does not match the base package version.`);
    }
    packageInputs.push({ role: 'locale', locale, path });
  }

  const shared = {
    dataVersion:   base.dataVersion,
    schemaVersion: base.schemaVersion,
    pgFingerprint: input.pgFingerprint,
    packages:      packageInputs,
    generatedAt:   input.generatedAt,
  };
  const manifest = input.game === 'magic'
    ? await createSearchPublicationManifest({
      game:        'magic',
      ...shared,
      typeSymbols: input.typeSymbols,
      tagOwners:   input.tagOwners,
    })
    : await createSearchPublicationManifest({
      game:        'hearthstone',
      ...shared,
      buildNumber: base.buildNumber!,
    });
  const files = manifest.packages.map(descriptor => {
    const match = packageInputs.find(item => item.role === descriptor.role
      && (item.role === 'base' || (descriptor.role === 'locale' && item.locale === descriptor.locale)));
    if (match == null) throw new Error('The search manifest refers to a package that was not prepared.');
    return {
      key:    descriptor.key,
      path:   match.path,
      sha256: descriptor.sha256,
      bytes:  descriptor.bytes,
    };
  });
  return { manifest, files };
}

function assertMetadata(
  metadata: ReturnType<typeof inspectLocalSearchPackage>,
  game: SearchPublicationGame,
  role: 'base' | 'locale',
  locale: string | null,
): void {
  if (metadata.game !== game || metadata.packageRole !== role || metadata.locale !== locale) {
    throw new Error('The exported search package has the wrong game, role, or language.');
  }
}
