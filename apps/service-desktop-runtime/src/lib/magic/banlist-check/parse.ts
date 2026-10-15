import { load } from 'cheerio';

import type { OfficialBanlist, OfficialCardEntry, OfficialSource, RestrictionKind } from './types';

/** Reads card names from list items while retaining their source category. */
export function parseListSections(html: string, source: OfficialSource, formatId: string, fetchedAt: string): OfficialBanlist {
  const $ = load(html);
  const entries: OfficialCardEntry[] = [];
  const scopes: OfficialBanlist['scopes'] = [];
  const notices = [...(source.notices ?? [])];
  let updatedAt: string | null = null;
  let foundSection = false;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const dateMatch = bodyText.match(/(?:last\s+updated|updated\s+on|latest\s+update|mise\s+à\s+jour\s+le)\s*[:·]?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{4}[·/-]\d{1,2}[·/-]\d{1,2}|\d{1,2}\s+\w+\s+\d{4})/i);
  if (dateMatch) updatedAt = dateMatch[1] ?? null;

  if (source.parser === 'canadian_highlander') {
    $('table tr').each((_, row) => {
      const cells = $(row).find('th,td').toArray().map(cell => $(cell).text().trim());
      if (cells.length >= 2 && /^\d+$/.test(cells[1] ?? '')) {
        entries.push({ name: cells[0] ?? '', kind: 'points', points: Number(cells[1]), note: null });
      }
    });
    const heading = $('body').text();
    foundSection = /points list/i.test(heading) && entries.length > 0;
    if (/shares?\s+(?:a\s+)?banned\s+list\s+with\s+Vintage/i.test(heading)) {
      scopes.push({ description: 'The format also uses the Vintage banned list.', expanded: false });
      notices.push('The Vintage banned list must be checked separately.');
    }
  } else {
    const kindByFormat: Record<string, RestrictionKind> = {
      historic:             'suspended', timeless:             'restricted',
      duelcommander:        'banned_in_deck', pauper_duelcommander: 'banned_in_deck',
    };
    let activeKind: RestrictionKind = kindByFormat[formatId] ?? 'banned';
    const headings = $('h1,h2,h3,h4').toArray();
    for (const heading of headings) {
      const title = $(heading).text().replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const normalized = title.toLowerCase();
      if (source.parser === 'commander' && /^banned list$/i.test(title)) {
        foundSection = true;
        for (const candidate of headings) {
          const name = $(candidate).text().replace(/\s+/g, ' ').trim();
          if (!name || /^(banned list|official commander website)$/i.test(name)) continue;
          const following = $(candidate).nextUntil('h1,h2,h3,h4').text().replace(/\s+/g, ' ');
          const bannedDate = following.match(/banned\s*:\s*([^\n]+)/i)?.[1]?.trim();
          if (bannedDate && bannedDate !== '—' && bannedDate !== '-') {
            entries.push({ name, kind: 'banned', points: null, note: null });
          }
        }
        continue;
      }
      if (source.parser === 'wizards' && !sectionMatchesFormat(normalized, formatId)) continue;
      if (source.parser !== 'wizards' && !isListHeading(normalized, source.parser)) continue;
      foundSection = true;
      activeKind = categoryFromHeading(title, activeKind);
      let node = $(heading).next();
      let guard = 0;
      while (node.length && !/^h[1-4]$/i.test(node[0]?.tagName ?? '') && guard++ < 30) {
        node.find('li').each((_, item) => {
          const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
          if (!text) return;
          if (isRuleScope(text)) {
            scopes.push({ description: text, expanded: false });
          } else if (/^banned as (?:commander|companion)$/i.test(text)) {
            return;
          } else {
            const cardText = text
              .replace(/\s+\([^)]*only[^)]*\)$/i, '')
              .replace(/\s*\[\]$/, '')
              .replace(/\s+Nouveau$/, '')
              .trim();
            if (cardText && !/^(no current|none|the following cards)/i.test(cardText)) {
              const list = $(item).closest('ul,ol');
              const parentLabel = list.parent('li').clone().children('ul,ol').remove().end().text().trim();
              const listLead = list.prevAll('p,h2,h3,h4').first().text() || parentLabel;
              const kind = /restricted/i.test(listLead)
                ? 'restricted'
                : categoryFromHeading(listLead, kindFromEntry(text, activeKind));
              entries.push({ name: cardText, kind, points: null, note: text === cardText ? null : text.slice(cardText.length).trim() });
            }
          }
        });
        node = node.next();
      }
    }
  }

  if (source.parser === 'conquest' && foundSection) {
    const listDate = bodyText.match(/latest update\s*(?:·|:)?\s*(\d{4}[·/-]\d{1,2}[·/-]\d{1,2})/i);
    updatedAt = listDate?.[1] ?? updatedAt;
    scopes.push({ description: 'The Conquest card pool excludes reserved-list and other rules-defined cards.', expanded: false });
  }
  if (source.parser === 'pdh' && foundSection) {
    scopes.push({ description: 'Cards removed from constructed formats, Conspiracy cards, and ante cards are also excluded.', expanded: false });
  }
  if (source.parser === 'commander' && foundSection) {
    scopes.push({ description: 'Ante, Conspiracy, and cards removed from constructed formats are also banned.', expanded: false });
  }
  if (source.parser === 'leviathan' && foundSection) {
    notices.push('This is the final retained list for a discontinued format.');
    scopes.push({ description: 'Ante, Conspiracy, silver-bordered, Vanguard, acorn, sticker, and Attraction cards are excluded.', expanded: false });
  }

  const unique = new Map<string, OfficialCardEntry>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.name.toLocaleLowerCase()}`;
    const previous = unique.get(key);
    if (!previous || entry.points != null) unique.set(key, entry);
  }
  const filtered = [...unique.values()].filter(entry => entry.name.length > 0);
  const noCurrentEntries = /no current suspensions|no cards are currently banned|there are no banned cards/i.test(bodyText);
  const complete = foundSection && (filtered.length > 0 || noCurrentEntries);
  return {
    formatId, sourceId:   source.id, sourceName: source.name, url:        source.url, fetchedAt, updatedAt,
    entries:    filtered, scopes:     deduplicateScopes(scopes), notices:    [...new Set(notices)], complete,
    reason:     complete ? null : 'The page did not contain the expected list content.',
  };
}

/** Selects a list section whose heading names the requested Wizards format. */
function sectionMatchesFormat(title: string, formatId: string): boolean {
  const names: Record<string, string[]> = {
    standard:       ['standard banned cards'], pioneer:        ['pioneer banned cards'], modern:         ['modern banned cards'],
    legacy:         ['legacy banned cards'], vintage:        ['vintage banned and restricted cards'], alchemy:        ['alchemy banned cards'],
    historic:       ['historic banned cards'], timeless:       ['timeless banned and restricted cards'],
    pauper:         ['pauper banned cards'], brawl:          ['brawl banned cards'], standard_brawl: ['brawl banned cards'],
  };
  return (names[formatId] ?? []).some(name => title.includes(name));
}

/** Identifies page headings that introduce supported official list sections. */
function isListHeading(title: string, parser: OfficialSource['parser']): boolean {
  if (parser === 'oathbreaker') return title.includes('banned cards') || title === 'banned list';
  if (parser === 'duelcommander') return /banned as|banned in|restricted|banned for offensive|structurally banned/.test(title);
  if (parser === 'pdc') return /interdit|bannie|banned/.test(title);
  if (parser === 'conquest') return title.includes('banlist');
  if (parser === 'pdh') return title === 'banlist' || title.includes('ban list');
  if (parser === 'commander') return title.includes('banned list');
  if (parser === 'leviathan') return title.includes('ban list') || /banned as|banned in/.test(title);
  return false;
}

/** Maps category words in source headings to the closest preserved list status. */
function categoryFromHeading(title: string, fallback: RestrictionKind): RestrictionKind {
  const value = title.toLowerCase();
  if (/companion/.test(value)) return 'banned_as_companion';
  if (/commander only|as commander|en tant que commandant/.test(value)) return 'banned_as_commander';
  if (/in the deck|in deck|dans le deck/.test(value)) return 'banned_in_deck';
  if (/restricted|limité/.test(value)) return 'restricted';
  if (/suspend/.test(value)) return 'suspended';
  return fallback;
}

/** Preserves card-specific status notes found alongside an entry. */
function kindFromEntry(text: string, fallback: RestrictionKind): RestrictionKind {
  if (/only banned as a companion/i.test(text)) return 'banned_as_companion';
  if (/only banned as (?:a )?commander/i.test(text)) return 'banned_as_commander';
  if (/restricted/i.test(text)) return 'restricted';
  if (/suspended/i.test(text)) return 'suspended';
  return fallback;
}

/** Keeps rule-defined groups out of explicit card entries. */
function isRuleScope(text: string): boolean {
  return /^(all cards|cards with|cards that|cards whose|the \d+ cards|silver-bordered cards|ante cards|conspiracy cards|the ten fetchlands|all cards that)/i.test(text);
}

/** Removes duplicate rule-defined descriptions without changing their wording. */
function deduplicateScopes(scopes: OfficialBanlist['scopes']): OfficialBanlist['scopes'] {
  return [...new Map(scopes.map(scope => [scope.description.toLowerCase(), scope])).values()];
}
