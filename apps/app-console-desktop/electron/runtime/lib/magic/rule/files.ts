import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sourceFile } from '@tcg-cards/model/magic/schema/document-content';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';

import { listLocalRuleFiles } from './list';

const contentTypes: Record<SourceFile['format'], string> = {
  txt:  'text/plain',
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf:  'application/rtf',
};

/** Identifies Unicode encodings from original bytes without guessing legacy code pages. */
export function textEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch { return null; }
}

/** Enriches actual archive files and keeps supplied provenance separate from measured bytes. */
export async function readOriginalRuleFiles(root: string, version: string, declared: SourceFile[] = [], options: {
  txtBytes?: Uint8Array;
  supplied?: SourceFile[];
} = {}): Promise<SourceFile[]> {
  const supplied = declared.map(file => sourceFile.parse(file));
  const measured = await Promise.all(listLocalRuleFiles(root, version).map(async file => {
    let metadata = supplied.find(item => item.format === file.format && item.language === file.language && item.translationId == null);
    const expected = options.supplied?.find(item => item.format === file.format && item.language === file.language && item.translationId == null);
    const path = join(root, file.storageKey!.slice('magic/rule/'.length));
    const bytes = file.format === 'txt' && options.txtBytes != null ? options.txtBytes : await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if ((expected?.sha256 != null && expected.sha256 !== sha256) || (expected?.size != null && expected.size !== bytes.length)) {
      throw new Error('Original file does not match its supplied metadata');
    }
    // A replacement cannot inherit provenance or page counts from different bytes.
    if (metadata?.sha256 != null && metadata.sha256 !== sha256) metadata = expected;
    return sourceFile.parse({
      sourceUrl:             null,
      effectiveUrl:          null,
      originalFilename:      null,
      sourceKind:            null,
      publisher:             null,
      declaredEffectiveDate: null,
      filenameDate:          null,
      dateBasis:             null,
      pageCount:             null,
      encoding:              null,
      ...metadata,
      ...file,
      size:                  bytes.length,
      sha256,
      contentType:           metadata?.contentType ?? contentTypes[file.format],
      ...(file.format === 'txt' ? { encoding: textEncoding(bytes) } : {}),
    });
  }));
  // URL-only descriptors and translation files need no desktop file to remain valid.
  return [...measured, ...supplied.filter(file => !measured.some(item => item.format === file.format
    && item.language === file.language && item.translationId === file.translationId))];
}
