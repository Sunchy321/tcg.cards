import { formats as magicFormats } from '@tcg-cards/model/magic/schema/basic';

import type { OfficialSource, SourceCoverage } from './types';

/** Official pages used by the Magic official-list check. */
export const officialSources: OfficialSource[] = [
  {
    id:      'wizards',
    name:    'Wizards of the Coast',
    url:     'https://magic.wizards.com/en/banned-restricted-list',
    formats: ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'alchemy', 'historic', 'timeless', 'pauper', 'brawl', 'standard_brawl'],
    parser:  'wizards',
  },
  {
    id:      'commander',
    name:    'Commander Format Panel',
    url:     'https://mtgcommander.net/index.php/banned-list/',
    formats: ['commander'],
    parser:  'commander',
  },
  {
    id:      'oathbreaker',
    name:    'Oathbreaker Rules Committee',
    url:     'https://oathbreakermtg.org/banned-list/',
    formats: ['oathbreaker'],
    parser:  'oathbreaker',
  },
  {
    id:      'canadian_highlander',
    name:    'Canadian Highlander',
    url:     'https://canadianhighlander.ca/points-list/',
    formats: ['canadian_highlander'],
    parser:  'canadian_highlander',
  },
  {
    id:      'duelcommander',
    name:    'Duel Commander Committee',
    url:     'https://www.duelcommander.org/banlist/',
    formats: ['duelcommander'],
    parser:  'duelcommander',
  },
  {
    id:      'conquest',
    name:    'ConquestHub',
    url:     'https://conquesthub.wordpress.com/banlist/',
    formats: ['conquest'],
    parser:  'conquest',
    notices: ['The page is read-only and may not include later Discord announcements.'],
  },
  {
    id:      'pdh',
    name:    'PDH Home Base',
    url:     'https://pdhhomebase.com/rules/',
    formats: ['pauper_commander'],
    parser:  'pdh',
  },
  {
    id:      'pdc',
    name:    'Pauper Duel Commander Committee',
    url:     'https://pauperduelcommander.fr/fr/banlist/',
    formats: ['pauper_duelcommander'],
    parser:  'pdc',
  },
  {
    id:      'leviathan',
    name:    'Leviathan Commander',
    url:     'https://leviathancommander.wixsite.com/home/current-ban-list',
    formats: ['leviathan_commander'],
    parser:  'leviathan',
    notices: ['The format has ended; this is its retained final list.'],
  },
];

const coverageNotes: Record<string, Omit<SourceCoverage, 'formatId'>> = {
  extended:            { status: 'not_applicable', reason: 'The format is discontinued and has no current official list.' },
  penny:               { status: 'not_applicable', reason: 'The format website states that it currently has no banlist.' },
  duelcommander_docfx: { status: 'not_applicable', reason: 'This local fork is outside the official-list check scope.' },
  commander1v1:        { status: 'not_applicable', reason: 'This format is outside the official-list check scope.' },
  explorer:            { status: 'not_applicable', reason: 'This format is outside the official-list check scope.' },
};

/** Records every model format as covered, inapplicable, or requiring confirmation. */
export const sourceCoverage: SourceCoverage[] = magicFormats.map(formatId => {
  const source = officialSources.find(item => item.formats.includes(formatId));
  if (source) return { formatId, status: 'configured', reason: null };
  const note = coverageNotes[formatId];
  return note
    ? { formatId, ...note }
    : { formatId, status: 'needs_confirmation', reason: 'No official source has been confirmed for this format.' };
});

/** Finds the official source registered for one local format. */
export function sourceForFormat(formatId: string): OfficialSource | null {
  return officialSources.find(source => source.formats.includes(formatId)) ?? null;
}

/** Returns the source coverage record for one local format. */
export function coverageForFormat(formatId: string): SourceCoverage | null {
  return sourceCoverage.find(item => item.formatId === formatId) ?? null;
}
