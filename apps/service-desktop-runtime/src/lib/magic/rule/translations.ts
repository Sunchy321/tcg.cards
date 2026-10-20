import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import z from 'zod';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { CrTranslationError } from '@tcg-cards/console-api/lib/magic/documents/community';
import type { DocumentStore } from '@tcg-cards/console-api/lib/magic/documents/store';

/** Supplies the local community checkout and its static content store. */
interface Dependencies {
  root:  string | null;
  store: DocumentStore;
}

/** Exposes local paired editions without fetching or creating their English sources. */
export function createRuleTranslationOperations({ root, store }: Dependencies) {
  return {
    /** Lists paired files and the persisted Chinese selection for each local release. */
    async list() {
      const dates = new Map<string, { date: string, available: boolean, imported: boolean }>();
      if (root != null) {
        let files: string[];
        try {
          files = await readdir(join(root, 'scripts'));
        } catch {
          throw new CrTranslationError(['无法读取中文译本目录，请检查本地译本设置。']);
        }
        for (const file of files) {
          if (!/^\d{8}\.json$/.test(file)) continue;
          const compact = file.slice(0, 8);
          const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
          if (z.iso.date().safeParse(date).success) dates.set(date, { date, available: true, imported: false });
        }
      }
      const translation = (await store.translations('magic-cr')).find(row => row.language === 'zhs');
      if (translation != null) {
        for (const release of (await store.releases('magic-cr')).filter(row => row.deletedAt == null)) {
          const binding = (await store.releaseTranslations(release.id)).find(row => row.translationId === translation.id);
          if (binding == null) continue;
          const compact = release.versionTag.replaceAll('-', '');
          const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
          dates.set(date, { date, available: dates.get(date)?.available ?? false, imported: true });
        }
      }
      return { configured: root != null, versions: [...dates.values()].sort((a, b) => b.date.localeCompare(a.date)) };
    },
    /** Reads and validates one paired edition before importing its Chinese content. */
    async importVersion(input: { version: string }) {
      const date = z.iso.date().parse(input.version);
      if (root == null) throw new CrTranslationError(['请先在游戏设置中配置完整规则中文译本目录。']);
      let text: string;
      try {
        text = await readFile(join(root, 'scripts', `${date.replaceAll('-', '')}.json`), 'utf8');
      } catch {
        throw new CrTranslationError([`${date}：未找到可读取的中英对照文件，请检查本地译本目录。`]);
      }
      let content: unknown;
      try {
        content = JSON.parse(text.replace(/^\uFEFF/, ''));
      } catch {
        throw new CrTranslationError([`${date}：中英对照文件无法读取，请检查文件格式。`]);
      }
      return createDocumentService(store, { track: 'local' }).importCrTranslation({ versionTag: date, content });
    },
  };
}
