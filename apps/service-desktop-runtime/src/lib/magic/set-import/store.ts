import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { MtgchZhsSet, MtgjsonSet, ScryfallSet, SetDisplayChoice } from '@tcg-cards/db/schema/local/magic';
import { Set as Series, SetLocalization } from '@tcg-cards/db/schema/shared/magic/set';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { softDeleteMissing, upsertBatch } from '../upsert';
import { buildSeries, parseSeriesResponse, type DisplayChoice, type SourceSeries, type Statistics, type Supplement } from './series';

/** Cached inputs reused by the series stage; large raw card payloads stay in PostgreSQL. */
export interface SeriesInputs {
  supplements:        Map<string, Supplement>;
  chinese:            Map<string, string>;
  statistics:         Map<string, Statistics>;
  missingSeries:      string[];
  missingSupplements: string[];
}

/** Fetches and validates the complete Scryfall series list, rejecting incomplete responses. */
export async function fetchSeries(): Promise<SourceSeries[]> {
  const response = await fetch('https://api.scryfall.com/sets', {
    headers: { 'User-Agent': 'TCGCards/1.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Scryfall 系列列表获取失败（${response.status}）`);
  return parseSeriesResponse(await response.json());
}

/** Caches a successfully validated complete list and reads lightweight supplemental inputs. */
export async function prepareSeries(database: LocalDb, sources: SourceSeries[]): Promise<SeriesInputs> {
  await database.transaction(async tx => {
    await upsertBatch(tx, ScryfallSet, sources.map(s => ({
      setId:         s.id, code:          s.code.toLowerCase(), name:          s.name, setType:       s.set_type,
      cardCount:     s.card_count, digital:       s.digital, foilOnly:      s.foil_only, nonfoilOnly:   s.nonfoil_only,
      mtgoCode:      s.mtgo_code ?? null, arenaCode:     s.arena_code ?? null, tcgplayerId:   s.tcgplayer_id ?? null,
      releasedAt:    s.released_at ?? null, blockCode:     s.block_code ?? null, block:         s.block ?? null,
      parentSetCode: s.parent_set_code?.toLowerCase() ?? null, printedSize:   s.printed_size ?? null,
      scryfallUri:   s.scryfall_uri ?? null, uri:           s.uri ?? null, iconSvgUri:    s.icon_svg_uri ?? null, searchUri:     s.search_uri ?? null,
    })), ScryfallSet.setId, ['setId']);
    await softDeleteMissing(tx, ScryfallSet, [ScryfallSet.setId], ['setId'], new Set(sources.map(s => s.id)));
    // Existing human selections must survive the first import even for retired series.
    const old = await tx.select({ setId:           Series.setId, symbolStyle:     Series.symbolStyle,
      doubleFacedIcon: Series.doubleFacedIcon }).from(Series)
      .where(sql`${Series.symbolStyle} is not null or ${Series.doubleFacedIcon} is not null`);
    for (const row of old) await tx.insert(SetDisplayChoice).values(row).onConflictDoNothing();
  });
  const [supplements, chinese, prints, old] = await Promise.all([
    database.select({ setId:            MtgjsonSet.setId, baseSetSize:      MtgjsonSet.baseSetSize, totalSetSize:     MtgjsonSet.totalSetSize,
      isOnlineOnly:     MtgjsonSet.isOnlineOnly, isPaperOnly:      MtgjsonSet.isPaperOnly, isForeignOnly:    MtgjsonSet.isForeignOnly,
      isPartialPreview: MtgjsonSet.isPartialPreview, keyruneCode:      MtgjsonSet.keyruneCode,
      tcgplayerGroupId: MtgjsonSet.tcgplayerGroupId, mcmId:            MtgjsonSet.mcmId, mcmIdExtras:      MtgjsonSet.mcmIdExtras,
      mcmName:          MtgjsonSet.mcmName, cardsphereSetId:  MtgjsonSet.cardsphereSetId,
      tokenSetCode:     MtgjsonSet.tokenSetCode, translations:     MtgjsonSet.translations,
    }).from(MtgjsonSet).where(isNull(MtgjsonSet.deletedAt)),
    database.select({ code: MtgchZhsSet.code, name: MtgchZhsSet.name }).from(MtgchZhsSet).where(isNull(MtgchZhsSet.deletedAt)),
    database.selectDistinct({ set: Print.set, lang: Print.lang, rarity: Print.rarity }).from(Print).where(isNull(Print.deletedAt)),
    database.select({ setId: Series.setId }).from(Series),
  ]);
  const statistics = new Map<string, Statistics>();
  for (const print of prints) {
    const code = print.set.toLowerCase();
    const stats = statistics.get(code) ?? { langs: [], rarities: [] };
    stats.langs.push(print.lang);
    stats.rarities.push(print.rarity);
    statistics.set(code, stats);
  }
  const codes = new Set(sources.map(s => s.code.toLowerCase()));
  const supplementMap = new Map(supplements.map(s => [s.setId.toLowerCase(), s]));
  return { supplements:        supplementMap, chinese:            new Map(chinese.map(s => [s.code.toLowerCase(), s.name])), statistics,
    missingSeries:      old.filter(s => !codes.has(s.setId.toLowerCase())).map(s => s.setId),
    missingSupplements: [...codes].filter(code => !supplementMap.has(code)),
  };
}

/** Updates one series and its names atomically, serializing edits with manual display saves. */
export async function writeSeries(database: LocalDb, source: SourceSeries, inputs: SeriesInputs): Promise<void> {
  const setId = source.code.toLowerCase();
  await database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'magic:set:' + setId}))`);
    const [previous] = await tx.select().from(Series).where(eq(Series.setId, setId));
    const names = await tx.select().from(SetLocalization).where(eq(SetLocalization.setId, setId));
    const [choice] = await tx.select().from(SetDisplayChoice).where(eq(SetDisplayChoice.setId, setId));
    const result = buildSeries({ source, previous, names, choice, supplement: inputs.supplements.get(setId),
      chinese:    inputs.chinese.get(setId), statistics: inputs.statistics.get(setId) });
    const { setId: id, ...values } = result.row;
    await tx.insert(Series).values(result.row).onConflictDoUpdate({ target: Series.setId, set: values });
    await tx.delete(SetLocalization).where(eq(SetLocalization.setId, id));
    await tx.insert(SetLocalization).values(result.names);
  });
}

/** Saves shared human choices and their exported display values in the same transaction. */
export async function saveDisplayChoice(database: LocalDb, setId: string, choice: DisplayChoice): Promise<void> {
  await database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'magic:set:' + setId}))`);
    const [series] = await tx.select({ setId: Series.setId }).from(Series).where(eq(Series.setId, setId));
    if (!series) throw new Error('系列不存在');
    await tx.insert(SetDisplayChoice).values({ setId, ...choice }).onConflictDoUpdate({
      target: SetDisplayChoice.setId, set: { ...choice, updatedAt: new Date() },
    });
    await tx.update(Series).set(choice).where(eq(Series.setId, setId));
  });
}

/** Cached MTGJSON identifiers bridged to the game's existing print identity. */
export interface SourceCard { uuid: string, scryfallId: string }
/** Local print identity used by booster membership, excluding historical duplicates. */
export interface PrintIdentity { scryfallId: string | null, cardId: string, set: string, number: string, lang: string }

/** Reads compact UUID mappings without transferring full source-card payloads. */
export async function loadBoosterIdentities(database: LocalDb): Promise<{ cards: SourceCard[], prints: PrintIdentity[] }> {
  const cards = await database.execute<{ uuid: string, scryfallId: string }>(sql`
    select card->>'uuid' as uuid, card->'identifiers'->>'scryfallId' as "scryfallId"
    from ${MtgjsonSet}, lateral jsonb_array_elements(
      coalesce(${MtgjsonSet.data}->'cards', '[]'::jsonb) || coalesce(${MtgjsonSet.data}->'tokens', '[]'::jsonb)
    ) as card
    where ${MtgjsonSet.deletedAt} is null and card->'identifiers'->>'scryfallId' is not null
  `);
  const prints = await database.select({ scryfallId: Print.scryfallCardId, cardId:     Print.cardId,
    set:        Print.set, number:     Print.number, lang:       Print.lang }).from(Print)
    .where(and(isNull(Print.deletedAt), eq(Print.version, ''), eq(Print.source, ''), isNotNull(Print.scryfallCardId)));
  return { cards: [...cards], prints };
}
