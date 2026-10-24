import { load } from 'cheerio';
import { captureDocument } from './capture';

import type { OfficialBanlist, OfficialCardEntry, OfficialSource, RestrictionKind } from './types';

/** Reads card names from list items while retaining their source category. */
export function parseListSections(html: string, source: OfficialSource, formatId: string, fetchedAt: string): OfficialBanlist {
  const $ = load(html);
  const entries: OfficialCardEntry[] = [];
  const { byNode } = captureDocument($);
  /** Preserves the exact source node even when other formats repeat the same name. */
  const addEntry = (entry: OfficialCardEntry, node: unknown) => entries.push({ ...entry, evidence: byNode.get(node) });
  const scopes: OfficialBanlist['scopes'] = [];
  const notices = [...(source.notices ?? [])];
  let updatedAt: string | null = null;
  let foundSection = false;
  let sectionContentFound = false;
  const inheritedFormats: string[] = [];
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const dateMatch = bodyText.match(/(?:last\s+updated|updated\s+on|latest\s+update|mise\s+à\s+jour\s+le)\s*[:·]?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{4}[·/-]\d{1,2}[·/-]\d{1,2}|\d{1,2}\s+\w+\s+\d{4})/i);
  if (dateMatch) updatedAt = dateMatch[1] ?? null;

  if (source.parser === 'wizards') {
    let active = false;
    let kind: RestrictionKind = 'banned';
    // A format section ends at the next format heading, not at explanatory subheadings.
    $('h1,h2,h3,h4,p,li').each((_, node) => {
      const text = $(node).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (node.tagName === 'p' && /banned in all formats/i.test(text) && ruleGroup(text) === 'offensive') {
        scopes.push({ description: text, expanded: false, group: 'offensive', originUrl: source.url });
      }
      if (/^h[1-4]$/.test(node.tagName)) {
        if (/\bbanned(?: and restricted)? cards$/i.test(text)) {
          active = sectionMatchesFormat(text.toLowerCase(), formatId);
          if (active) {
            foundSection = true;
            kind = formatId === 'timeless' ? 'restricted' : 'banned';
          }
        }
        return;
      }
      if (!active) return;
      if (node.tagName === 'p') {
        if (/the following cards are|no cards are currently banned|there are no banned cards/i.test(text)) kind = categoryFromHeading(text, kind);
        if (/no cards are currently banned|there are no banned cards/i.test(text)) sectionContentFound = true;
        return;
      }
      if (node.tagName !== 'li' || isPrintingRule(text)) return;
      if (/^no current suspensions$/i.test(text)) return;
      if (/^(?:none|no cards are currently banned|there are no banned cards)$/i.test(text)) {
        sectionContentFound = true;
        return;
      }
      sectionContentFound = true;
      const group = ruleGroup(text);
      if (group || isRuleScope(text)) scopes.push({ description: text, expanded: false, group, originUrl: source.url });
      else addEntry({ name: text, kind: kindFromEntry(text, kind), points: null, note: null }, node);
    });
  } else if (source.parser === 'pdh') {
    let active = false;
    $('h1,h2,h3,h4,p').each((_, node) => {
      if ($(node).closest('nav,footer').length) return;
      const text = $(node).text().replace(/\s+/g, ' ').trim();
      if (/^banlist$/i.test(text.replace(/\s/g, ''))) {
        active = true;
        foundSection = true;
        return;
      }
      if (!active) return;
      if (/^h[1-4]$/.test(node.tagName) || /comprehensive rules/i.test(text)) {
        active = false;
        return;
      }
      $(node).find('a[href*="scryfall.com/card/"]').each((_, card) => {
        const name = $(card).text().trim();
        if (name) addEntry({ name, kind: 'banned', points: null, note: null }, card);
      });
      const lines = $(node).clone();
      lines.find('br').replaceWith('\n');
      for (const line of lines.text().split('\n')) {
        const description = line.replace(/\s+/g, ' ').trim();
        const group = ruleGroup(description);
        if (group) scopes.push({ description, expanded: false, group });
      }
    });
  } else if (source.parser === 'pdc') {
    $('h2').each((_, heading) => {
      const title = $(heading).text().trim();
      if (!/^interdit (?:en tant que commandant|dans le deck)$/i.test(title)) return;
      let container = $(heading).parent();
      // The card grid is outside the title wrapper on the committee's current page.
      while (container.length && !container.is('body') && !container.find('[data-banlist-grid]').length) container = container.parent();
      if (!container.length || container.is('body')) return;
      foundSection = true;
      const kind = categoryFromHeading(title, 'banned_in_deck');
      container.find('[data-banlist-grid] [data-card-name]').each((_, card) => {
        const name = ($(card).text().trim() || $(card).attr('data-card-name') || '').replace(/\s+Nouveau$/i, '').trim();
        if (name) addEntry({ name, kind, points: null, note: null }, card);
      });
    });
  } else if (source.parser === 'tlr') {
    $('h1,h2,h3,h4').each((_, heading) => {
      const title = $(heading).text().replace(/\s+/g, ' ').trim();
      let kind: RestrictionKind;
      if (/banned as tiny leader/i.test(title)) kind = 'banned_as_commander';
      else if (/banned as companion/i.test(title)) kind = 'banned_as_companion';
      else if (/banned from deck construction/i.test(title)) kind = 'banned';
      else if (/categorically excluded/i.test(title)) {
        foundSection = true;
        $(heading).nextUntil('h1,h2,h3,h4').find('li').each((_, item) => {
          const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
          if (!text) return;
          scopes.push({ description: text, expanded: false, group: ruleGroup(text) ?? undefined, originUrl: source.url });
        });
        return;
      } else return;

      foundSection = true;
      $(heading).nextUntil('h1,h2,h3,h4').find('li').each((_, item) => {
        const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
        if (!text || /^(?:none|no cards)$/i.test(text)) return;
        sectionContentFound = true;
        // The official TLR page retains the printed title's historical "Imperial" typo;
        // the current Oracle identity is "Empyrial".
        const name = text === 'Derevi, Imperial Tactician' ? 'Derevi, Empyrial Tactician' : text;
        addEntry({ name, kind, points: null, note: null }, item);
      });
    });
  } else if (source.parser === 'gladiator') {
    $('h1,h2,h3,h4').each((_, heading) => {
      if (!/^the banned list$/i.test($(heading).text().replace(/\s+/g, ' ').trim())) return;
      foundSection = true;
      $(heading).nextUntil('h1,h2,h3,h4').find('li').each((_, item) => {
        const name = $(item).text().replace(/\s+/g, ' ').trim();
        if (!name) return;
        sectionContentFound = true;
        addEntry({ name, kind: 'banned', points: null, note: null }, item);
      });
    });
  } else if (source.parser === 'oldschool') {
    let activeKind: RestrictionKind | null = null;
    $('h1,h2,h3,h4,p,li').each((_, node) => {
      const text = $(node).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
      if (node.tagName === 'p') {
        const lines = $(node).clone();
        lines.find('br').replaceWith('\n');
        for (const rawLine of lines.text().split('\n')) {
          const line = rawLine.replace(/[•·]/g, '').replace(/\s+/g, ' ').trim();
          if (/^the following cards are banned by ec in 93-94 tournaments\b/i.test(line)) {
            activeKind = 'banned';
            foundSection = true;
            continue;
          }
          if (/^the following cards are restricted by ec in 93-94 tournaments\b/i.test(line)) {
            activeKind = 'restricted';
            foundSection = true;
            continue;
          }
          if (!activeKind || !line) continue;
          sectionContentFound = true;
          addEntry({ name: line, kind: activeKind, points: null, note: null }, node);
        }
        return;
      }
      if (/^h[1-4]$/.test(node.tagName)) {
        if (/^the following cards are banned by ec in 93-94 tournaments\b/i.test(text)) {
          activeKind = 'banned';
          foundSection = true;
        } else if (/^the following cards are restricted by ec in 93-94 tournaments\b/i.test(text)) {
          activeKind = 'restricted';
          foundSection = true;
        } else if (activeKind) {
          activeKind = null;
        }
        return;
      }
      if (!activeKind || !text || $(node).parents('li').length) return;
      sectionContentFound = true;
      foundSection = true;
      addEntry({ name: text, kind: activeKind, points: null, note: null }, node);
    });
  } else if (source.parser === 'conquest') {
    foundSection = $('h1,h2').toArray().some(node => /^banlist$/i.test($(node).text().trim()));
    const content = $('.wp-block-post-content,.entry-content').first();
    let reserved = false;
    content.find('h2,li').each((_, node) => {
      const text = $(node).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
      if (node.tagName === 'h2') {
        if (/reserved list/i.test(text)) reserved = true;
        return;
      }
      if (!foundSection || reserved || !text || $(node).children('ul,ol').length) return;
      const parent = $(node).parents('li').first().clone().children('ul,ol').remove().end().text();
      addEntry({ name: text, kind: categoryFromHeading(parent, 'banned'), points: null, note: null }, node);
    });
    $('p').each((_, node) => {
      const text = $(node).text().replace(/\s+/g, ' ').trim();
      if (!/conquest cardpool/i.test(text)) return;
      for (const group of ruleGroups(text)) scopes.push({ description: text, expanded: false, group });
    });
  } else if (source.parser === 'canadian_highlander') {
    $('table tr').each((_, row) => {
      const cells = $(row).find('th,td').toArray().map(cell => $(cell).text().trim());
      if (cells.length >= 2 && /^\d+$/.test(cells[1] ?? '')) {
        addEntry({ name: cells[0] ?? '', kind: 'points', points: Number(cells[1]), note: null }, row);
      }
    });
    const heading = $('body').text();
    foundSection = /points list/i.test(heading) && entries.length > 0;
    if (/shares?\s+(?:a\s+)?banned\s+list\s+with\s+Vintage/i.test(heading)) {
      inheritedFormats.push('vintage');
      scopes.push({ description: 'The format also uses the Vintage banned list.', expanded: false });
    }
  } else if (source.parser === 'leviathan') {
    let kind: RestrictionKind = 'banned';
    let stickerContinuation = false;
    // Wix separates the heading and each list into sibling text components.
    $('.wixui-rich-text').each((_, block) => {
      if ($(block).find('h1,h2,h3,h4').toArray().some(heading => /^ban list$/i.test($(heading).text().trim()))) {
        foundSection = true;
      }
      if (!foundSection) return;
      $(block).find('p,li').each((_, node) => {
        const text = $(node).text().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        if (node.tagName === 'p') {
          if ($(node).closest('li').length) return;
          if (/banned as (?:a )?companion/i.test(text)) kind = 'banned_as_companion';
          else if (/banned from being played as (?:a )?commander/i.test(text)) kind = 'banned_as_commander';
          return;
        }
        // The sticker/Attraction rule is split across two list items on this page.
        if (/^all cards that bring a sticker or an$/i.test(text)) {
          stickerContinuation = true;
          scopes.push({ description: 'All cards that bring a sticker or an Attraction into the game', expanded: false, group: 'unfinity' });
          return;
        }
        if (stickerContinuation && /^attraction into the game$/i.test(text)) {
          stickerContinuation = false;
          return;
        }
        const group = ruleGroup(text);
        if (group) scopes.push({ description: text, expanded: false, group });
        else if (/^(?:silver border cards|vanguards? cards|unfinity cards with acorn holo-foil)$/i.test(text)) return;
        else if (isRuleScope(text)) scopes.push({ description: text, expanded: false });
        else addEntry({ name: text, kind, points: null, note: null }, node);
      });
    });
  } else if (source.parser === 'duelcommander') {
    // Duel Commander stores actual card identities on cards, while nearby lists contain rules and advice.
    $('section.ban-category').each((_, section) => {
      const title = $(section).children('h2').first().text().replace(/\s+/g, ' ').trim();
      if (!/banned as|banned in|banned for offensive|structurally banned/i.test(title)) return;
      foundSection = true;
      const kind = categoryFromHeading(title, 'banned');
      $(section).find('[data-card-name]').each((_, card) => {
        // Some card attributes are HTML-escaped twice by the source page.
        const rawName = $(card).attr('data-card-name')?.trim();
        const name = rawName ? load(rawName, null, false).text().trim() : '';
        if (name) addEntry({ name, kind, points: null, note: null }, card);
      });
      if (!/structurally banned/i.test(title)) return;
      $(section).find('li').each((_, item) => {
        const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
        if (!text || /^see\b/i.test(text)) return;
        // Printing and platform eligibility are outside this banlist comparison.
        if (/^(?:(?:gold|silver)-bordered|acorn stamp|square-cornered|digital-only) cards$/i.test(text)) return;
        const group = ruleGroup(text);
        if (group) {
          scopes.push({ description: text, expanded: false, group });
        } else {
          addEntry({ name: text, kind: 'banned', points: null, note: null }, item);
        }
      });
    });
  } else {
    const kindByFormat: Record<string, RestrictionKind> = {
      'historic':             'suspended', 'timeless':             'restricted',
      'duelcommander':        'banned_in_deck', 'pauper-duelcommander': 'banned_in_deck',
    };
    let activeKind: RestrictionKind = kindByFormat[formatId] ?? 'banned';
    const headings = $('h1,h2,h3,h4').toArray();
    for (const heading of headings) {
      const title = $(heading).text().replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const normalized = title.toLowerCase();
      if (source.parser === 'commander' && /^banned list$/i.test(title)) {
        foundSection = true;
        const article = $(heading).closest('article');
        const content = article.length ? article : $(heading).nextUntil('h1,h2,h3,h4');
        content.find('li').each((_, item) => {
          const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
          if (text && isRuleScope(text)) scopes.push({ description: text, expanded: false, group: ruleGroup(text) });
        });
        const details = content.find('details');
        if (details.length) {
          details.each((_, detail) => {
            const name = $(detail).children('summary').first().text().replace(/\s+/g, ' ').trim();
            if (name) addEntry({ name, kind: 'banned', points: null, note: null }, $(detail).children('summary').first()[0]);
          });
          continue;
        }
        for (const candidate of headings) {
          const name = $(candidate).text().replace(/\s+/g, ' ').trim();
          if (!name || /^(banned list|official commander website)$/i.test(name)) continue;
          const following = $(candidate).nextUntil('h1,h2,h3,h4').text().replace(/\s+/g, ' ');
          const bannedDate = following.match(/banned\s*:\s*([^\n]+)/i)?.[1]?.trim();
          if (bannedDate && bannedDate !== '—' && bannedDate !== '-') {
            addEntry({ name, kind: 'banned', points: null, note: null }, candidate);
          }
        }
        continue;
      }
      if (!isListHeading(normalized, source.parser)) continue;
      foundSection = true;
      activeKind = categoryFromHeading(title, activeKind);
      let node = $(heading).next();
      let guard = 0;
      while (node.length && !/^h[1-4]$/i.test(node[0]?.tagName ?? '') && guard++ < 30) {
        node.find('li').each((_, item) => {
          const text = $(item).clone().children('ul,ol').remove().end().text().replace(/\s+/g, ' ').trim();
          if (!text || isPrintingRule(text)) return;
          if (isRuleScope(text)) {
            scopes.push({ description: text, expanded: false, group: ruleGroup(text) });
          } else if (/^banned as (?:commander|companion)$/i.test(text)) {
            return;
          } else {
            const cardText = text
              .replace(/\s*\[\]$/, '')
              .replace(/\s+Nouveau$/, '')
              .trim();
            if (cardText && !/^(no current|none|the following cards)/i.test(cardText)) {
              const list = $(item).closest('ul,ol');
              const parentLabel = list.parent('li').clone().children('ul,ol').remove().end().text().trim();
              const listLead = list.prevAll('p,h2,h3,h4').first().text() || parentLabel;
              const kind = /restricted/i.test(listLead)
                ? 'restricted'
                : kindFromEntry(text, categoryFromHeading(listLead, activeKind));
              addEntry({ name: cardText, kind, points: null, note: text === cardText ? null : text.slice(cardText.length).trim() }, item);
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

  const filtered = entries.filter(entry => entry.name.trim().length > 0);
  const noCurrentEntries = /no current suspensions|no cards are currently banned|there are no banned cards/i.test(bodyText);
  const complete = foundSection && (source.parser === 'wizards' || source.parser === 'tlr' || source.parser === 'gladiator' || source.parser === 'oldschool' ? sectionContentFound : filtered.length > 0 || scopes.length > 0 || noCurrentEntries);
  return {
    formatId, sourceId:   source.id, sourceName: source.name, url:        source.url, fetchedAt, updatedAt,
    entries:    filtered, scopes:     deduplicateScopes(scopes), notices:    [...new Set(notices)], complete,
    ...(inheritedFormats.length ? { inheritedFormats } : {}),
    reason:     complete
      ? null
      : source.parser === 'wizards' && formatId === 'standard-brawl' && !foundSection
        ? 'The official page has no separate Standard Brawl list.'
        : 'The page did not contain the expected list content.',
  };
}

/** Selects a list section whose heading names the requested Wizards format. */
function sectionMatchesFormat(title: string, formatId: string): boolean {
  const names: Record<string, string[]> = {
    'commander':         ['commander banned cards'],
    'standard':          ['standard banned cards'], 'pioneer':           ['pioneer banned cards'], 'modern':            ['modern banned cards'],
    'legacy':            ['legacy banned cards'], 'vintage':           ['vintage banned and restricted cards'], 'alchemy':           ['alchemy banned cards'],
    'historic':          ['historic banned cards'], 'timeless':          ['timeless banned and restricted cards'],
    'pauper':            ['pauper banned cards'], 'brawl':             ['brawl banned cards'], 'standard-brawl':    ['standard brawl banned cards'],
    'competitive-brawl': ['competitive brawl banned cards'],
  };
  return (names[formatId] ?? []).some(name => title === name);
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
  if (/\bin (?:the )?deck\b|dans le deck/.test(value)) return 'banned_in_deck';
  // A combined page title is not the category of every list below it.
  if (/\bbanned\b/.test(value) && !/\brestricted\b/.test(value)) return 'banned';
  if (/restricted|limité/.test(value)) return 'restricted';
  if (/suspend/.test(value)) return 'suspended';
  return fallback;
}

/** Preserves card-specific status notes found alongside an entry. */
function kindFromEntry(text: string, fallback: RestrictionKind): RestrictionKind {
  if (/\bbo[ -]?1\b|best[\s‐‑–-]*of[\s‐‑–-]*one/i.test(text)) return 'banned_in_bo1';
  if (/only banned as a companion/i.test(text)) return 'banned_as_companion';
  if (/only banned as (?:a )?commander/i.test(text)) return 'banned_as_commander';
  if (/restricted/i.test(text)) return 'restricted';
  if (/suspended/i.test(text)) return 'suspended';
  return fallback;
}

/** Keeps rule-defined groups out of explicit card entries. */
function isRuleScope(text: string): boolean {
  return /^(all cards|cards with|cards that|cards whose|(?:the )?\d+ cards|silver-bordered cards|ante cards|conspiracy cards|the ten fetchlands|all cards that)/i.test(text);
}

/** Excludes printing-specific eligibility rules from card identity comparison. */
function isPrintingRule(text: string): boolean {
  return /^(?:(?:gold|silver)[ -]border(?:ed)?|acorn(?: stamp)?|square[ -]cornered|digital[ -]only) cards(?:[.,]|$)/i.test(text);
}

/** Recognizes collective card types and mechanics despite punctuation and explanatory links. */
function ruleGroups(text: string): NonNullable<OfficialBanlist['scopes'][number]['group']>[] {
  const plain = text.replace(/[“”"‘’]/g, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const groups: NonNullable<OfficialBanlist['scopes'][number]['group']>[] = [];
  if (/conspiracy.*card type|card type.*conspiracy|^(?:all )?conspiracy cards/.test(plain)) groups.push('conspiracy');
  if (/playing (?:for|with) ante|refer(?:ring|s)? to (?:the )?ante|ante mechanic|^(?:all )?ante cards/.test(plain)) groups.push('ante');
  if (/racial|cultural insensitivity|removed.*(?:offensive|constructed formats)/.test(plain)) groups.push('offensive');
  if (/stickers?.*(?:attractions?|into (?:the game|play))/.test(plain)) groups.push('unfinity');
  return groups;
}

/** Resolves a single-category official row to the existing local group. */
function ruleGroup(text: string): OfficialBanlist['scopes'][number]['group'] {
  return ruleGroups(text)[0];
}

/** Removes duplicate rule-defined descriptions without changing their wording. */
function deduplicateScopes(scopes: OfficialBanlist['scopes']): OfficialBanlist['scopes'] {
  return [...new Map(scopes.map(scope => [scope.group ?? scope.description.toLowerCase(), scope])).values()];
}
