import { documentMeta } from '@tcg-cards/model/magic/schema/document-content';
import { ruleFile } from '@tcg-cards/model/magic/schema/rule-api';
import type { RuleIdentity, RuleMetadata, RuleVersion } from '@tcg-cards/model/magic/schema/rule-api';

import type { Document, DocumentStore, Release } from './store';

/** Reads published rule metadata without loading full rulebook node text. */
export function createRuleReader(store: DocumentStore) {
  /** Selects supported rule identities without treating arbitrary articles as rules. */
  async function document(ruleId: string): Promise<Document | undefined> {
    if (ruleId !== 'magic-cr') return undefined;
    const row = await store.document(ruleId);
    return row?.origin === 'static' && row.staticKey === ruleId && row.visibility === 'public' && row.deletedAt == null ? row : undefined;
  }

  /** Orders only live public releases using the existing serving chronology. */
  async function releases(documentId: string): Promise<Release[]> {
    return (await store.releases(documentId)).filter(row => row.deletedAt == null)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.versionTag.localeCompare(a.versionTag));
  }

  return {
    /** Lists rulebooks with at least one published release. */
    async list(): Promise<RuleIdentity[]> {
      const row = await document('magic-cr');
      if (row == null || (await releases(row.id)).length === 0) return [];
      return [{ id: row.id, title: row.title, sourceLanguage: row.sourceLanguage }];
    },
    /** Lists release languages only when their selected revision exists. */
    async versions(ruleId: string): Promise<RuleVersion[] | undefined> {
      const row = await document(ruleId);
      if (row == null) return undefined;
      const revisions = new Map((await store.revisions(row.id)).map(revision => [revision.id, revision]));
      return Promise.all((await releases(row.id)).map(async release => {
        const source = revisions.get(release.sourceRevisionId);
        const languages = new Set(source ? [source.language] : []);
        for (const binding of await store.releaseTranslations(release.id)) {
          const revision = revisions.get(binding.revisionId);
          if (revision?.sourceRevisionId === release.sourceRevisionId && revision.translationId === binding.translationId) languages.add(revision.language);
        }
        return { versionTag: release.versionTag, effectiveDate: release.effectiveDate, publishedAt: release.publishedAt.toISOString(), languages: [...languages] };
      }));
    },
    /** Resolves an exact selected language without the site's source-text fallback. */
    async meta(input: { ruleId: string; versionTag?: string; language?: string }): Promise<RuleMetadata | undefined> {
      const row = await document(input.ruleId);
      if (row == null) return undefined;
      const available = await releases(row.id);
      const release = input.versionTag == null ? available[0] : available.find(item => item.versionTag === input.versionTag);
      if (release == null) return undefined;
      const revisions = await store.revisions(row.id);
      const source = revisions.find(item => item.id === release.sourceRevisionId && item.translationId == null);
      if (source == null) return undefined;
      let revision = source;
      if (input.language != null && input.language !== source.language) {
        const translation = (await store.translations(row.id)).find(item => item.language === input.language);
        const binding = translation ? (await store.releaseTranslations(release.id)).find(item => item.translationId === translation.id) : undefined;
        const selected = binding ? revisions.find(item => item.id === binding.revisionId && item.language === input.language
          && item.sourceRevisionId === source.id && item.translationId === translation!.id) : undefined;
        if (selected == null) return undefined;
        revision = selected;
      }
      return {
        ruleId: row.id, title: revision.title, versionTag: release.versionTag, revisionId: revision.id, language: revision.language,
        effectiveDate: release.effectiveDate, publishedAt: release.publishedAt.toISOString(), meta: documentMeta.parse(revision.meta ?? {}),
        files: release.files.filter(file => file.language === revision.language && (file.translationId == null || file.translationId === revision.translationId))
          .map(({ storageKey: _key, ...file }) => ruleFile.parse(file)),
      };
    },
  };
}
