import { createDocumentService } from './service';
import type { DocumentStore, Release } from './store';

/** Lists retained CR editions in the same order as the public reader. */
export async function listCrReleases(store: DocumentStore): Promise<Release[]> {
  return (await store.releases('magic-cr')).filter(release => release.deletedAt == null)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime() || right.versionTag.localeCompare(left.versionTag));
}

/** Resolves compact dates, dashed dates, or full identities to an active serving edition. */
export async function readCrRelease(store: DocumentStore, version?: string, language = 'en') {
  const releases = await listCrReleases(store);
  const requested = version?.replace(/^magic-cr:/, '').replaceAll('-', '');
  const release = version == null ? releases[0] : releases.find(row => row.id === version || row.versionTag.replaceAll('-', '') === requested);
  if (release == null) throw new Error('Rule version not found');
  const page = await createDocumentService(store, { track: 'remote' }).read({
    slug: 'magic-cr', versionTag: release.versionTag, locale: language,
  });
  return { release, page };
}
