import { eq } from 'drizzle-orm';
import { Announcement, AnnouncementItem } from '@tcg-cards/db/schema/local/magic';
import { getLocalDb } from '../../hearthstone/hsdata-local-db';
import { resolveFormats } from '../announcement/projection';
import { compareBanlists } from './compare';
import { loadComparisonData } from './data';
import { createPageReader, fetchOfficialBanlist, fetchOfficialPage } from './fetch';
import { coverageForFormat } from './sources';
import type { BanlistComparison } from './compare';

/** Reads authored restrictions and their application evidence without changing local data. */
export async function loadRestrictionHistory() {
  return getLocalDb().select({
    announcement: {
      id:                    Announcement.id, name:                  Announcement.name, source:                Announcement.source, date:                  Announcement.date,
      effectiveDate:         Announcement.effectiveDate, effectiveDateArena:    Announcement.effectiveDateArena,
      effectiveDateTabletop: Announcement.effectiveDateTabletop, effectiveDateOnline:   Announcement.effectiveDateOnline,
      links:                 Announcement.link,
    },
    item: {
      id:            AnnouncementItem.id, type:          AnnouncementItem.type, cardId:        AnnouncementItem.cardId,
      format:        AnnouncementItem.format, status:        AnnouncementItem.status, score:         AnnouncementItem.score,
      group:         AnnouncementItem.group, effectiveDate: AnnouncementItem.effectiveDate, projection:    AnnouncementItem.projection,
    },
  }).from(AnnouncementItem).innerJoin(Announcement, eq(Announcement.id, AnnouncementItem.announcementId))
    .where(eq(AnnouncementItem.type, 'card_change')).orderBy(Announcement.date, AnnouncementItem.order, AnnouncementItem.id);
}

/** Injectable external reads keep batch behavior testable without a database or network. */
interface ReportDependencies {
  loadData:    typeof loadComparisonData;
  loadHistory: typeof loadRestrictionHistory;
  readPage:    typeof fetchOfficialPage;
}

/** Lists facts that warrant investigation without assigning responsibility from absence alone. */
function reviewHints(comparison: BanlistComparison, history: Awaited<ReturnType<typeof loadRestrictionHistory>>) {
  const hints: { kind: string, cardId: string | null, details: string }[] = [];
  const rowsByName = new Map<string, number>();
  for (const match of comparison.matches) rowsByName.set(match.entry.name, (rowsByName.get(match.entry.name) ?? 0) + 1);
  for (const row of comparison.unmatched) {
    if (rowsByName.has(row.name)) hints.push({ kind: 'repeated_official_entry', cardId: row.candidates[0] ?? null, details: row.name });
  }
  for (const row of comparison.officialOnly) {
    const authored = history.some(record => record.item.cardId === row.cardId || record.item.cardId === `#${row.group}`);
    hints.push({ kind:    authored ? 'local_announcement_exists_but_restriction_absent' : 'no_related_local_restriction_found', cardId:  row.cardId,
      details: authored ? 'Check dates, format lifetime, status changes, and projection before adding another announcement.' : 'An official-only entry is a candidate local gap; verify source section and applicability first.' });
  }
  for (const row of comparison.localOnly) hints.push({ kind:    'local_restriction_absent_from_current_source', cardId:  row.cardId,
    details: 'Absence from the current page does not prove an unban. Check the attached local announcement links and official history.' });
  return hints;
}

/** Produces one fresh, versioned evidence bundle for all local formats, isolating per-format failures. */
export async function buildBanlistReport(overrides: Partial<ReportDependencies> = {}) {
  const dependencies = { loadData: loadComparisonData, loadHistory: loadRestrictionHistory, readPage: fetchOfficialPage, ...overrides };
  const startedAt = new Date().toISOString();
  const [data, history] = await Promise.all([dependencies.loadData(), dependencies.loadHistory()]);
  const reader = createPageReader(dependencies.readPage);
  const namesById = new Map(data.localNames.map(card => [card.cardId, card]));
  const formats = await Promise.all([...data.formats].sort((a, b) => a.formatId.localeCompare(b.formatId)).map(async format => {
    const coverage = coverageForFormat(format.formatId);
    const official = await fetchOfficialBanlist(format.formatId, reader.read);
    try {
      const eligible = data.groupEligibility[format.formatId];
      const comparison = compareBanlists(format.formatId, official, format, data.localNames, data.groups, eligible);
      const ids = new Set([
        ...comparison.officialOnly, ...comparison.localOnly, ...comparison.statusDifferences, ...comparison.pointsDifferences,
        ...comparison.approximateMatches,
      ].map(card => card.cardId));
      for (const row of comparison.unmatched) for (const id of row.candidates) ids.add(id);
      const groupMembers = Object.entries(data.groups).map(([group, members]) => ({
        group,
        officialRulePresent: official.scopes.some(scope => scope.group === group),
        members:             [...new Set(members)].map(cardId => ({
          cardId, name:     namesById.get(cardId)?.name ?? cardId,
          eligible: eligible == null || eligible.has(cardId),
          local:    format.banlist.find(card => card.cardId === cardId) ?? null,
        })),
      }));
      const relatedAnnouncements = history.filter(record => {
        const targetsFormat = resolveFormats(record.item.format).includes(format.formatId)
          || record.item.projection.formats.includes(format.formatId);
        const direct = record.item.cardId != null && ids.has(record.item.cardId);
        const collective = record.item.cardId?.startsWith('#');
        const projected = record.item.projection.cards.some(card => ids.has(card.cardId))
          || record.item.projection.derivedCards?.some(card => card.formatId === format.formatId && ids.has(card.cardId));
        // Keep a missing authored format visible when it could explain a missing restriction.
        return (targetsFormat && (direct || collective || projected)) || (record.item.format == null && direct);
      });
      return {
        formatId:       format.formatId, names:          format.localization, coverage:       coverage?.status ?? 'needs_confirmation',
        coverageReason: coverage?.reason ?? null, error:          null, comparison, official,
        local:          { birthday: format.birthday, deathdate: format.deathdate, banlist: format.banlist, relatedAnnouncements },
        groupMembers, reviewHints:    reviewHints(comparison, relatedAnnouncements),
      };
    } catch (error) {
      return {
        formatId:       format.formatId, names:          format.localization, coverage:       coverage?.status ?? 'needs_confirmation',
        coverageReason: coverage?.reason ?? null, error:          error instanceof Error ? error.message : String(error), comparison:     null, official,
        local:          { birthday: format.birthday, deathdate: format.deathdate, banlist: format.banlist, relatedAnnouncements: [] },
        groupMembers:   [], reviewHints:    [],
      };
    }
  }));
  const pages = await Promise.all([...reader.pages].map(async ([url, promise]) => {
    try {
      const { html: _html, ...snapshot } = await promise;
      return snapshot;
    } catch (error) {
      return { url, fetchedAt: startedAt, httpStatus: null, contentType: null, sha256: null, text: null, rows: [], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const issues = formats.flatMap(format => {
    const report = format.comparison;
    if (format.error) return [{ formatId: format.formatId, category: 'comparison_error', data: format.error }];
    if (!report) return [];
    const result: { formatId: string, category: string, data: unknown }[] = [];
    for (const category of ['officialOnly', 'localOnly', 'statusDifferences', 'pointsDifferences', 'approximateMatches', 'unmatched', 'manualReview'] as const) {
      for (const row of report[category]) result.push({ formatId: format.formatId, category, data: row });
    }
    if (report.status === 'unavailable' || format.coverage !== 'configured') result.push({ formatId: format.formatId, category: 'coverage', data: { coverage: format.coverage, reason: report.reason } });
    return result;
  });
  return {
    reportVersion:  1, startedAt, finishedAt:     new Date().toISOString(),
    interpretation: {
      assessment:   'unreviewed',
      categories:   ['scope_mismatch', 'official_source_issue', 'local_data_gap'],
      instructions: [
        'Issues and reviewHints are observations, not final diagnoses. Categories above are possible conclusions for subsequent review.',
        'Compare official row sections and nearby category text with parsed kinds and matches to detect scope or parser mismatches.',
        'Use local announcement links, effective dates, format lifetime, and projection to distinguish missing data from unapplied data.',
        'A current official-page omission is not proof of an unban; verify historical announcements before assigning responsibility.',
        'Group members include eligibility and current local records. Ineligible members are evidence only and do not count as official bans.',
        'Unavailable, incomplete, unconfigured, and inapplicable formats do not establish agreement.',
      ],
    },
    summary: {
      formats:           formats.length, issues:            issues.length,
      consistent:        formats.filter(format => format.comparison?.status === 'consistent').length,
      differences:       formats.filter(format => format.comparison?.status === 'differences').length,
      incomplete:        formats.filter(format => format.comparison?.status === 'incomplete').length,
      unavailable:       formats.filter(format => format.coverage === 'configured' && (format.comparison?.status === 'unavailable' || format.error != null)).length,
      notApplicable:     formats.filter(format => format.coverage === 'not_applicable').length,
      needsConfirmation: formats.filter(format => format.coverage === 'needs_confirmation').length,
      sourcePages:       pages.length,
    },
    issues, formats, pages,
  };
}

/** Versioned report returned by HTTP and downloaded unchanged by the desktop UI. */
export type BanlistReport = Awaited<ReturnType<typeof buildBanlistReport>>;
