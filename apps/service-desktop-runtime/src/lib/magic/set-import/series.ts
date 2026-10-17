import { z } from 'zod';
import type { Set as SeriesTable, SetLocalization } from '@tcg-cards/db/schema/shared/magic/set';
import type { Locale } from '@tcg-cards/model/magic/schema/basic';

/** Validates the complete online series list before any local writes. */
export const scryfallSeries = z.object({
  id:              z.uuid(), code:            z.string().min(1), name:            z.string().min(1), set_type:        z.string().min(1),
  card_count:      z.number().int().nonnegative(), digital:         z.boolean(), foil_only:       z.boolean(), nonfoil_only:    z.boolean(),
  released_at:     z.string().optional(), printed_size:    z.number().int().nonnegative().optional(),
  block:           z.string().optional(), block_code:      z.string().optional(), parent_set_code: z.string().optional(),
  mtgo_code:       z.string().optional(), arena_code:      z.string().optional(), tcgplayer_id:    z.number().int().optional(),
  scryfall_uri:    z.string().optional(), uri:             z.string().optional(), icon_svg_uri:    z.string().optional(), search_uri:      z.string().optional(),
});

/** Online Scryfall series metadata, without card data. */
export type SourceSeries = z.infer<typeof scryfallSeries>;

/** Rejects truncated or duplicate series collections before source-cache or domain writes. */
export function parseSeriesResponse(raw: unknown): SourceSeries[] {
  const parsed = z.object({ object:   z.literal('list'), has_more: z.literal(false),
    data:     z.array(scryfallSeries).min(1) }).safeParse(raw);
  if (!parsed.success) throw new Error('Scryfall 返回的系列列表不完整，未更新本地系列。');
  if (new Set(parsed.data.data.map(s => s.code.toLowerCase())).size !== parsed.data.data.length) {
    throw new Error('Scryfall 系列列表存在重复代码，未更新本地系列。');
  }
  return parsed.data.data;
}
/** Fields supplied by the imported MTGJSON series cache. */
export interface Supplement {
  name?:             string;
  releaseDate?:      string;
  baseSetSize?:      number | null;
  totalSetSize?:     number | null;
  isOnlineOnly?:     boolean | null;
  isPaperOnly?:      boolean | null;
  isForeignOnly?:    boolean | null;
  isPartialPreview?: boolean | null;
  keyruneCode?:      string | null;
  tcgplayerGroupId?: number | null;
  mcmId?:            number | null;
  mcmIdExtras?:      number | null;
  mcmName?:          string | null;
  cardsphereSetId?:  number | null;
  tokenSetCode?:     string | null;
  translations?:     Record<string, string | null> | null;
}
/** Persisted static series values, independent of import state. */
export type SeriesRow = typeof SeriesTable.$inferInsert;
/** Display names available for one series. */
export type SeriesName = typeof SetLocalization.$inferInsert;
/** Local print coverage attached to one series. */
export interface Statistics { langs: Locale[], rarities: string[] }
/** Human-authored display values preserved across every import. */
export interface DisplayChoice { symbolStyle: string[] | null, doubleFacedIcon: string[] | null }
/** Inputs needed to assemble one series without network or database access. */
export interface SeriesInput {
  source:      SourceSeries;
  supplement?: Supplement;
  chinese?:    string;
  statistics?: Statistics;
  previous?:   SeriesRow;
  names?:      SeriesName[];
  choice?:     DisplayChoice;
}

/** Maps MTGJSON's language labels to the existing site locale codes. */
const translationLocales: Record<string, string> = {
  'Chinese Traditional': 'zht', 'French':              'fr', 'German':              'de', 'Italian':             'it', 'Japanese':            'ja',
  'Korean':              'ko', 'Portuguese (Brazil)': 'pt', 'Russian':             'ru', 'Spanish':             'es',
};

/** Builds source-owned fields while keeping absent supplements and manual display values. */
export function buildSeries(input: SeriesInput): { row: SeriesRow, names: SeriesName[] } {
  const { source: s, supplement: m, previous: old, choice = old } = input;
  const setId = s.code.toLowerCase();
  const row: SeriesRow = {
    setId, scryfallId:      s.id, scryfallCode:    s.code.toLowerCase(), block:           s.block ?? null,
    parent:          s.parent_set_code?.toLowerCase() ?? null, printedSize:     s.printed_size ?? null,
    cardCount:       s.card_count, type:            s.set_type, isDigital:       s.digital, isFoilOnly:      s.foil_only,
    isNonfoilOnly:   s.nonfoil_only, releaseDate:     s.released_at ?? null,
    mtgoCode:        s.mtgo_code ?? null, arenaCode:       s.arena_code ?? null, tcgPlayerId:     s.tcgplayer_id ?? null,
    langs:           [...new Set(input.statistics?.langs ?? [])].sort(),
    rarities:        [...new Set(input.statistics?.rarities ?? [])].sort(),
    symbolStyle:     choice?.symbolStyle ?? null, doubleFacedIcon: choice?.doubleFacedIcon ?? null,
  };
  // A missing cache is different from a known source row with an absent value.
  for (const key of ['baseSetSize', 'totalSetSize', 'isOnlineOnly', 'isPaperOnly', 'isForeignOnly',
    'isPartialPreview', 'keyruneCode', 'tcgplayerGroupId', 'mcmId', 'mcmIdExtras', 'mcmName',
    'cardsphereSetId'] as const) {
    Object.assign(row, { [key]: m ? m[key] ?? null : old?.[key] ?? null });
  }
  row.tokenSetCode = m ? m.tokenSetCode?.toLowerCase() ?? null : old?.tokenSetCode ?? null;
  const names: SeriesName[] = [{ setId, lang: 'en', name: s.name, link: s.scryfall_uri ?? null }];
  const chinese = input.chinese;
  if (chinese) names.push({ setId, lang: 'zhs', name: chinese, link: null });
  if (m) {
    for (const [language, name] of Object.entries(m.translations ?? {})) {
      const lang = translationLocales[language];
      if (lang && name?.trim()) names.push({ setId, lang, name, link: null });
    }
  } else {
    names.push(...(input.names ?? []).filter(n => n.lang !== 'en' && n.lang !== 'zhs'));
  }
  return { row, names };
}
