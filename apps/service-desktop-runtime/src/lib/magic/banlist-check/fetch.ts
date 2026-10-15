import { createHash } from 'node:crypto';
import { captureSource } from './capture';
import { parseListSections } from './parse';
import { coverageForFormat, sourceForFormat } from './sources';
import type { OfficialBanlist, OfficialPage } from './types';

/** Fetches one source page and retains failures alongside the captured evidence. */
export async function fetchOfficialPage(url: string): Promise<OfficialPage> {
  const page: OfficialPage = {
    url, fetchedAt:   new Date().toISOString(), httpStatus:  null, contentType: null,
    sha256:      null, html:        null, text:        null, rows:        [], error:       null,
  };
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'TCG-Cards-Official-List-Check/1.0' },
      signal:  AbortSignal.timeout(20_000),
    });
    page.httpStatus = response.status;
    page.contentType = response.headers.get('content-type');
    page.html = await response.text();
    page.sha256 = createHash('sha256').update(page.html).digest('hex');
    Object.assign(page, captureSource(page.html));
    if (!response.ok) throw new Error(`The official page returned HTTP ${response.status}.`);
    if (!page.html.trim()) throw new Error('The official page returned an empty response.');
  } catch (error) {
    page.error = error instanceof Error ? error.message : String(error);
  }
  return page;
}

/** Shares in-flight page reads within a single batch, without keeping stale global results. */
export function createPageReader(read: typeof fetchOfficialPage = fetchOfficialPage) {
  const pages = new Map<string, Promise<OfficialPage>>();
  return {
    pages,
    read(url: string) {
      let page = pages.get(url);
      if (!page) {
        page = read(url);
        pages.set(url, page);
      }
      return page;
    },
  };
}

/** Fetches and parses one format's configured list, optionally sharing its page with a batch. */
export async function fetchOfficialBanlist(formatId: string, readPage: typeof fetchOfficialPage = fetchOfficialPage): Promise<OfficialBanlist> {
  const source = sourceForFormat(formatId);
  const empty: OfficialBanlist = {
    formatId, sourceId:   source?.id ?? '', sourceName: source?.name ?? '', url:        source?.url ?? '',
    fetchedAt:  new Date().toISOString(), updatedAt:  null, entries:    [], scopes:     [], notices:    [...(source?.notices ?? [])],
    complete:   false, reason:     coverageForFormat(formatId)?.reason ?? 'No official source is configured for this format.',
  };
  if (!source) return empty;
  try {
    const page = await readPage(source.url);
    if (page.error || page.html == null) return { ...empty, fetchedAt: page.fetchedAt, reason: page.error ?? 'The official page returned an empty response.' };
    const parsed = parseListSections(page.html, source, formatId, page.fetchedAt);
    // Canadian Highlander inherits bans, never Vintage's restricted statuses or point costs.
    for (const inheritedFormat of parsed.inheritedFormats ?? []) {
      const inherited = await fetchOfficialBanlist(inheritedFormat, readPage);
      if (!inherited.complete) return { ...parsed, complete: false, reason: `The inherited ${inheritedFormat} banned list could not be read completely.` };
      parsed.entries.push(...inherited.entries.filter(entry => entry.kind === 'banned').map(entry => ({ ...entry, originUrl: inherited.url })));
      parsed.scopes = parsed.scopes.filter(scope => scope.description !== 'The format also uses the Vintage banned list.');
      const scopes = [...parsed.scopes, ...inherited.scopes.map(scope => ({ ...scope, originUrl: inherited.url }))];
      parsed.scopes = [...new Map(scopes.map(scope => [scope.group ?? scope.description, scope])).values()];
    }
    return parsed;
  } catch (error) {
    return { ...empty, reason: error instanceof Error ? error.message : String(error) };
  }
}
