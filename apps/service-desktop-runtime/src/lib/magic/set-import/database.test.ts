import { expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { MtgjsonSet, MtgchZhsSet } from '@tcg-cards/db/schema/local/magic';
import { Set as Series } from '@tcg-cards/db/schema/shared/magic/set';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { print } from '@tcg-cards/model/magic/schema/print';
import expected from '../project/tests/witty-roastmaster--folk-overrides-official/expected.json';
import { buildSeries, type SourceSeries } from './series';
import { loadBoosterIdentities, prepareSeries, saveDisplayChoice, writeSeries } from './store';
import { boosterStore } from './booster-store';
import { buildBoosters, createPrintLookup, updateBoosters } from './boosters';
import { publishReferences, referenceStore } from './publish';

const localUrl = process.env.MAGIC_SET_TEST_DATABASE_URL;
const remoteUrl = process.env.MAGIC_SET_REMOTE_TEST_DATABASE_URL;

/** Allows integration writes only to explicitly named, isolated local test databases. */
function requireTestDatabase(value: string | undefined, name: string): string {
  if (!value) throw new Error('Missing test database URL');
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.pathname !== `/${name}`) throw new Error('Use an isolated local test database');
  return value;
}

test.skipIf(!localUrl || !remoteUrl)('imports, protects manual choices, preserves failed boosters and atomically publishes real PostgreSQL rows', async () => {
  const local = createDb(requireTestDatabase(localUrl, 'magic_set_test'));
  const remote = createDb(requireTestDatabase(remoteUrl, 'magic_set_remote_test'));
  const source: SourceSeries = { id:           '4e47a6cd-cdeb-4b0f-8f24-cfe1a0127cb3', code:         'snc',
    name:         'Streets of New Capenna', set_type:     'expansion', card_count:   512,
    digital:      false, foil_only:    false, nonfoil_only: false, released_at:  '2022-04-29' };
  const booster = { boostersTotalWeight: 1, boosters:            [{ weight: 1, contents: { common: 1 } }],
    sheets:              { common: { totalWeight: 1, foil: false, cards: { a: 1 } } } };
  try {
    const legacy = buildSeries({ source }).row;
    await local.insert(Series).values({ ...legacy, symbolStyle: ['white'], doubleFacedIcon: ['sun', 'moon'] });
    await local.insert(Series).values({ ...legacy, setId: 'retired' });
    const card = print.parse({ ...expected.prints[0], imageInfo: null, illustrationId: null });
    await local.insert(Print).values(card);
    await local.insert(MtgjsonSet).values({ setId:        'SNC', name:         'Old name', type:         'expansion', baseSetSize:  281,
      totalSetSize: 302, releaseDate:  '2000-01-01', isFoilOnly:   false, isOnlineOnly: false, keyruneCode:  'SNC',
      data:         { cards: [{ uuid: 'a', identifiers: { scryfallId: card.scryfallCardId } }], booster: { draft: booster } } });
    await local.insert(MtgchZhsSet).values({ setId: source.id, code: 'SNC', name: '新卡佩纳：喧嚣黑街' });
    const inputs = await prepareSeries(local, [source]);
    expect(inputs.missingSeries).toEqual(['retired']);
    await writeSeries(local, source, inputs);
    const published = referenceStore(local, remote);
    let snapshot = await published.read();
    expect(snapshot.sets.find(s => s.setId === 'snc')).toMatchObject({ cardCount:       512, releaseDate:     '2022-04-29',
      langs:           ['zhs'], rarities:        ['common'], totalSetSize:    302, symbolStyle:     ['white'], doubleFacedIcon: ['sun', 'moon'] });
    await saveDisplayChoice(local, 'snc', { symbolStyle: ['black'], doubleFacedIcon: ['compass', 'land'] });
    await writeSeries(local, source, await prepareSeries(local, [source]));
    snapshot = await published.read();
    expect(snapshot.sets.find(s => s.setId === 'snc')).toMatchObject({ symbolStyle: ['black'], doubleFacedIcon: ['compass', 'land'] });
    await saveDisplayChoice(local, 'snc', { symbolStyle: null, doubleFacedIcon: null });
    await writeSeries(local, source, await prepareSeries(local, [source]));
    expect((await published.read()).sets.find(s => s.setId === 'snc')?.symbolStyle).toBeNull();

    const identities = await loadBoosterIdentities(local);
    const lookup = createPrintLookup(identities.cards, identities.prints);
    const store = boosterStore(local);
    expect((await updateBoosters(['snc'], store, lookup)).updated).toBe(1);
    const first = await published.read();
    expect(first.boosters).toHaveLength(1);
    expect(first.boosters[0]?.sheets[0]?.cards[0]).toMatchObject({ cardId: 'witty-roastmaster', lang: 'zhs', number: '131', weight: 1 });
    const rows = buildBoosters('snc', { booster: { draft: booster } }, lookup);
    await expect(store.replace('snc', [...rows, rows[0]!])).rejects.toThrow();
    expect((await published.read()).boosters).toEqual(first.boosters);
    await local.update(MtgjsonSet).set({ deletedAt: new Date() }).where(eq(MtgjsonSet.setId, 'SNC'));
    const missing = await prepareSeries(local, [source]);
    await writeSeries(local, source, missing);
    expect(missing.missingSupplements).toEqual(['snc']);
    expect((await updateBoosters(['snc'], store, lookup)).missing).toEqual(['snc']);
    expect((await published.read()).boosters).toEqual(first.boosters);
    expect((await published.read()).sets.find(s => s.setId === 'snc')?.totalSetSize).toBe(302);

    expect((await publishReferences(published, true)).setCount).toBe(2);
    expect((await referenceStore(remote, remote).read()).sets).toEqual([]);
    await publishReferences(published, false);
    const remoteBefore = await referenceStore(remote, remote).read();
    expect(remoteBefore.boosters).toEqual(first.boosters);
    const invalid = await published.read();
    invalid.boosters.push(invalid.boosters[0]!);
    invalid.sets[0]!.cardCount = 999;
    await expect(published.replace(invalid)).rejects.toThrow();
    expect((await referenceStore(remote, remote).read()).sets).toEqual(remoteBefore.sets);
    expect((await referenceStore(remote, remote).read()).boosters).toEqual(remoteBefore.boosters);
    await local.update(MtgjsonSet).set({ deletedAt: null, data: {} }).where(eq(MtgjsonSet.setId, 'SNC'));
    expect((await updateBoosters(['snc'], store, lookup)).updated).toBe(1);
    expect((await published.read()).boosters).toEqual([]);
  } finally {
    await local.$client.end({ timeout: 1 });
    await remote.$client.end({ timeout: 1 });
  }
}, 30_000);
