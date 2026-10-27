import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import type { DocumentStore } from '@tcg-cards/console-api/lib/magic/documents/store';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { listLocalRuleVersions } from './list';
import { readOriginalRuleFiles, textEncoding } from './files';

/** Records an import attempt independently of the article's saved content. */
export interface RuleImportAttempt {
  id:           string;
  sourceHash:   string;
  status:       'processing' | 'completed' | 'failed';
  revisionId?:  string;
  error?:       string;
  completedAt?: Date;
}

/** Supplies local source files, article storage, and import execution storage. */
interface RuleDependencies {
  root:  string | null;
  store: DocumentStore;
  recordImport(attempt: RuleImportAttempt): Promise<void>;
}

const versionDate = z.iso.date();

/** Imports downloaded CR files and exposes their persistent state to the desktop page. */
export function createRuleOperations({ root, store, recordImport }: RuleDependencies) {
  const documents = createDocumentService(store, { track: 'local' });
  return {
    /** Lists saved editions even when their original downloads are no longer present. */
    async listLocal() {
      const releases = (await store.releases('magic-cr')).filter(release => release.deletedAt == null);
      const counts = await store.revisionNodeCounts(releases.map(release => release.sourceRevisionId));
      const versions = new Map((root ? listLocalRuleVersions(root) : []).map(version => [version.date, version]));
      for (const release of releases) {
        const compact = release.versionTag.replaceAll('-', '');
        const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
        if (!versions.has(date)) versions.set(date, { date, files: { txt: false, doc: false, pdf: false } });
      }
      return [...versions.values()].sort((left, right) => right.date.localeCompare(left.date)).map(version => {
        const release = releases.find(row => row.versionTag.replaceAll('-', '') === version.date.replaceAll('-', ''));
        return {
          ...version, imported:   release != null, releaseId:  release?.id ?? null,
          totalNodes: release ? counts.get(release.sourceRevisionId) ?? 0 : null,
        };
      });
    },
    /** Records attempts separately from the immutable content created by a successful import. */
    async importVersion(input: { version: string, files?: SourceFile[] }) {
      // Validate before constructing a source path, including calls outside RPC.
      const version = versionDate.parse(input.version);
      if (root == null) throw new Error('Rule directory is not configured');
      const bytes = await readFile(join(root, 'txt', `${version}.txt`));
      const content = new TextDecoder(textEncoding(bytes) ?? 'utf-8').decode(bytes);
      const attempt = { id: randomUUID(), sourceHash: createHash('sha256').update(bytes).digest('hex') };
      await recordImport({ ...attempt, status: 'processing' });
      try {
        const result = await store.transaction('magic-cr', async tx => {
          const versionTag = version.replaceAll('-', '');
          const previous = (await tx.releases('magic-cr')).find(release => release.versionTag === versionTag);
          /** Groups one format within its source or translated language. */
          const key = (file: SourceFile) => `${file.language}:${file.format}:${file.translationId ?? ''}`;
          const supplied = new Map(previous?.files.map(file => [key(file), file]));
          for (const file of input.files ?? []) supplied.set(key(file), { ...supplied.get(key(file)), ...file });
          const files = await readOriginalRuleFiles(root, version, [...supplied.values()], { txtBytes: bytes, supplied: input.files });
          const imported = await createDocumentService(tx, { track: 'local' }).importCr({ content, versionTag, files });
          const release = (await tx.releases('magic-cr')).find(row => row.id === imported.releaseId)!;
          // The parsed TXT is the only file whose declared effective date is proven here.
          await tx.putRelease({ ...release, files: release.files.map(file => file.format === 'txt' && file.language === 'en'
            && file.storageKey === `magic/rule/txt/${version}.txt` && imported.effectiveDate != null
            ? { ...file, declaredEffectiveDate: imported.effectiveDate, dateBasis: 'document' }
            : file) });
          return imported;
        });
        await recordImport({ ...attempt, status: 'completed', revisionId: result.revisionId, completedAt: new Date() });
        return result;
      } catch (error) {
        await recordImport({ ...attempt, status: 'failed', error: error instanceof Error ? error.message : String(error), completedAt: new Date() });
        throw error;
      }
    },
    /** Reads an imported local edition through the shared article reader. */
    read(input: { slug?: string, versionTag?: string, locale?: string }) {
      return documents.read({ ...input, slug: input.slug ?? 'magic-cr' });
    },
  };
}
