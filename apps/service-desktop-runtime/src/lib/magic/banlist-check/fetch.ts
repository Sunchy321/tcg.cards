import { parseListSections } from './parse';
import { coverageForFormat, sourceForFormat } from './sources';
import type { OfficialBanlist } from './types';

/** Fetches and parses one format's configured official list without persisting it. */
export async function fetchOfficialBanlist(formatId: string): Promise<OfficialBanlist> {
  const source = sourceForFormat(formatId);
  const fetchedAt = new Date().toISOString();
  if (!source) {
    const coverage = coverageForFormat(formatId);
    return {
      formatId, sourceId:   '', sourceName: '', url:        '', fetchedAt, updatedAt:  null,
      entries:    [], scopes:     [], notices:    [], complete:   false,
      reason:     coverage?.reason ?? 'No official source is configured for this format.',
    };
  }

  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': 'TCG-Cards-Official-List-Check/1.0' },
      signal:  AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`The official page returned HTTP ${response.status}.`);
    const html = await response.text();
    if (!html.trim()) throw new Error('The official page returned an empty response.');
    return parseListSections(html, source, formatId, fetchedAt);
  } catch (error) {
    return {
      formatId, sourceId:   source.id, sourceName: source.name, url:        source.url, fetchedAt,
      updatedAt:  null, entries:    [], scopes:     [], notices:    [...(source.notices ?? [])], complete:   false,
      reason:     error instanceof Error ? error.message : 'The official page could not be read.',
    };
  }
}
