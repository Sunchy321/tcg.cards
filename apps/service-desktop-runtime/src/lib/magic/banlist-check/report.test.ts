import { describe, expect, test } from 'bun:test';
import { captureSource } from './capture';
import { buildBanlistReport } from './report';
import { buildBanlistReportResponse } from './report-http';
import { sourceForFormat } from './sources';
import { parseListSections } from './parse';
import type { ComparisonData } from './data';
import type { loadRestrictionHistory } from './report';
import type { OfficialPage } from './types';

/** Supplies real-shaped local formats without external dependencies. */
function format(formatId: string, banlist: ComparisonData['formats'][number]['banlist'] = []): ComparisonData['formats'][number] {
  return { formatId, localization: [], birthday: '2019-11-22', deathdate: null, tags: [], sets: null, banlist };
}

/** Makes a source response with the same capture shape as an actual HTTP fetch. */
function page(url: string, html: string): OfficialPage {
  return { url, html, ...captureSource(html), fetchedAt: '2026-10-15T00:00:00Z', httpStatus: 200, contentType: 'text/html', sha256: 'test', error: null };
}

/** Runs the actual batch/comparison behavior with source and database reads replaced. */
async function runReport() {
  const data: ComparisonData = {
    formats:    [format('standard'), format('brawl', [{ cardId: 'disruptor-flute', status: 'banned', score: null, date: '2024-06-03', group: null }]), format('pauper'), format('oathbreaker'), format('extended')],
    localNames: [
      { cardId: 'proft', name: 'Proft\'s Eidetic Memory', localizedName: null },
      { cardId: 'nadu', name: 'Nadu, Winged Wisdom', localizedName: null },
      { cardId: 'disruptor-flute', name: 'Disruptor Flute', localizedName: null },
      { cardId: 'ticketomaton', name: 'Ticketomaton', localizedName: null },
      { cardId: 'rare', name: 'Rare group member', localizedName: null },
    ],
    groups: { unfinity: ['ticketomaton', 'rare'] }, groupEligibility: { pauper: new Set(['ticketomaton']) },
  };
  const history: Awaited<ReturnType<typeof loadRestrictionHistory>> = [{
    announcement: { id:                    'a', name:                  'Original ban', source:                'wotc', date:                  '2024-06-03', effectiveDate:         null, effectiveDateArena:    null,
      effectiveDateTabletop: null, effectiveDateOnline:   null, links:                 [{ url: 'https://magic.wizards.com/original-announcement' }] },
    item: { id:            'i', type:          'card_change', cardId:        'disruptor-flute', format:        'brawl', status:        'banned', score:         null, group:         null, effectiveDate: null,
      projection:    { formats: ['brawl'], cards: [{ cardId: 'disruptor-flute', status: 'banned', effectiveDate: '2024-06-03' }] } },
  }];
  const calls: string[] = [];
  const report = await buildBanlistReport({
    loadData:    async () => data,
    loadHistory: async () => history,
    readPage:    async url => {
      calls.push(url);
      if (url === sourceForFormat('oathbreaker')!.url) throw new Error('offline source');
      return page(url, `<h2>Standard Banned Cards</h2><p>The following cards are banned:</p><ul><li>Proft's Eiditic Memory</li></ul>
        <h2>Pauper Banned Cards</h2><ul><li>All cards that bring a sticker or an Attraction into the game are banned.</li></ul>
        <h2>Brawl Banned Cards</h2><p>The following cards are banned:</p><ul><li>Nadu, Winged Wisdom</li></ul>
        <h2>Competitive Brawl Banned Cards</h2><p>The following cards are banned as your commander:</p><ul><li>Nadu, Winged Wisdom</li></ul>`);
    },
  });
  return { report, calls };
}

describe('whole-format evidence report', () => {
  test('reads each source once, isolates failures, and includes skipped formats', async () => {
    const { report, calls } = await runReport();
    expect(report.reportVersion).toBe(1);
    expect(report.formats).toHaveLength(5);
    expect(calls.filter(url => url === sourceForFormat('standard')!.url)).toHaveLength(1);
    expect(report.pages).toHaveLength(2);
    expect(report.formats.find(row => row.formatId === 'oathbreaker')?.comparison?.status).toBe('unavailable');
    expect(report.formats.find(row => row.formatId === 'standard')?.comparison?.status).toBe('differences');
    expect(report.formats.find(row => row.formatId === 'extended')?.coverage).toBe('not_applicable');
    expect(report.pages.find(row => row.url === sourceForFormat('oathbreaker')!.url)?.error).toBe('offline source');
    expect(report.issues.some(row => row.formatId === 'extended' && row.category === 'coverage')).toBe(true);
  });

  test('preserves wording, distinct source sections, matching tolerances, and original ban evidence', async () => {
    const { report } = await runReport();
    const standard = report.formats.find(row => row.formatId === 'standard')!;
    expect(standard.comparison?.matches).toMatchObject([{ cardId: 'proft', method: 'fuzzy', entry:  {
      name: 'Proft\'s Eiditic Memory', evidence: { section: 'Standard Banned Cards', lead: 'The following cards are banned:' },
    } }]);
    const brawl = report.formats.find(row => row.formatId === 'brawl')!;
    expect(brawl.official.entries.map(row => row.evidence?.section)).toEqual(['Brawl Banned Cards']);
    expect(brawl.comparison?.unmatched).toEqual([]);
    expect(brawl.local.relatedAnnouncements).toMatchObject([{ announcement: { date: '2024-06-03', links: [{ url: 'https://magic.wizards.com/original-announcement' }] } }]);
    expect(report.pages[0]?.text).toContain('Competitive Brawl');
    expect(JSON.stringify(report)).not.toContain('"html":');
    expect(report.interpretation.assessment).toBe('unreviewed');
  });

  test('retains group membership and eligibility without inflating the official count', async () => {
    const { report } = await runReport();
    const pauper = report.formats.find(row => row.formatId === 'pauper')!;
    expect(pauper.groupMembers).toMatchObject([{ group: 'unfinity', members: [{ cardId: 'ticketomaton', eligible: true }, { cardId: 'rare', eligible: false }] }]);
    expect(pauper.comparison?.officialOnly).toHaveLength(1);
    expect(pauper.comparison?.officialCount).toBe(1);
    expect(report.issues.some(row => row.category === 'approximateMatches')).toBe(true);
  });

  test('returns the same bundle through HTTP and downloadable JSON, without caching', async () => {
    const { report } = await runReport();
    const response = await buildBanlistReportResponse(true, async () => report);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment; filename="magic-banlist-report-');
    expect(await response.json()).toEqual(report);
    const inline = await buildBanlistReportResponse(false, async () => report);
    expect(inline.headers.has('content-disposition')).toBe(false);
    expect(await inline.json()).toEqual(report);
  });

  test('does not disguise a database failure as an empty successful report', async () => {
    const response = await buildBanlistReportResponse(false, async () => {
      throw new Error('database unavailable');
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ reason: 'database unavailable' });
  });
});

test('source evidence stays on the selected node when another format lists the same card first', () => {
  const official = parseListSections('<h2>Standard Banned Cards</h2><ul><li>Shared Card</li></ul><h2>Pioneer Banned Cards</h2><p>Only in BO1</p><ul><li>Shared Card</li></ul>', sourceForFormat('pioneer')!, 'pioneer', '2026-10-15');
  expect(official.entries).toHaveLength(1);
  expect(official.entries[0]?.evidence).toMatchObject({ text: 'Shared Card', section: 'Pioneer Banned Cards', lead: 'Only in BO1' });
});
