import { z } from 'zod';
import { asc, sql } from 'drizzle-orm';
import { Set as Series, SetLocalization, Booster } from '@tcg-cards/db/schema/shared/magic/set';
import { setDisplayChoice } from '@tcg-cards/model/magic/schema/set';
import { taskPageSnapshot } from '@tcg-cards/model/task';
import { os } from './index';
import { createAndRunTask } from './task';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { saveDisplayChoice } from '../lib/magic/set-import/store';
import { magicSetImportTaskDefinition as definition } from '../lib/magic/task/set-import';

/** Lists local series with real translated names and existing shared display choices. */
const list = os.output(z.array(z.object({
  setId:           z.string(), name:            z.string(), englishName:     z.string(), releaseDate:     z.string().nullable(),
  cardCount:       z.number(), langs:           z.array(z.string()), rarities:        z.array(z.string()), boosterCount:    z.number(),
  keyruneCode:     z.string().nullable(), symbolStyle:     z.array(z.string()).nullable(),
  doubleFacedIcon: z.array(z.string()).nullable(),
}))).handler(async () => {
  const database = getLocalDb();
  const [series, names, counts] = await Promise.all([
    database.select().from(Series).orderBy(asc(Series.setId)),
    database.select().from(SetLocalization),
    database.select({ setId: Booster.setId, count: sql<number>`count(*)::int` }).from(Booster).groupBy(Booster.setId),
  ]);
  const titles = new Map(names.map(n => [`${n.setId}:${n.lang}`, n.name]));
  const boosters = new Map(counts.map(c => [c.setId, c.count]));
  return series.map(row => ({
    setId:           row.setId, name:            titles.get(`${row.setId}:zhs`) ?? titles.get(`${row.setId}:en`) ?? row.setId,
    englishName:     titles.get(`${row.setId}:en`) ?? row.setId, releaseDate:     row.releaseDate,
    cardCount:       row.cardCount, langs:           row.langs, rarities:        row.rarities, boosterCount:    boosters.get(row.setId) ?? 0,
    keyruneCode:     row.keyruneCode, symbolStyle:     row.symbolStyle, doubleFacedIcon: row.doubleFacedIcon,
  }));
});

/** Saves global display choices immediately; subsequent imports read the independent record. */
const saveDisplay = os.input(setDisplayChoice).output(z.object({ setId: z.string() }))
  .handler(async ({ input }) => {
    const { setId, ...choice } = input;
    await saveDisplayChoice(getLocalDb(), setId, choice);
    return { setId };
  });

/** Starts the full import, or the icons-only variant that refreshes just the set icons. */
const importTask = os.input(z.strictObject({ iconsOnly: z.boolean().optional(), force: z.boolean().optional() })).output(taskPageSnapshot)
  .handler(async ({ input }) =>
    createAndRunTask(definition.taskType, {
      taskType:          definition.taskType, definitionVersion: definition.definitionVersion,
      scope:             { type: definition.scopeType, key: 'global', snapshot: {} },
      params:            { iconsOnly: input.iconsOnly === true, force: input.force === true },
    }));

/** Desktop-only management surface for source-owned metadata and human display choices. */
export const magicSetRouter = { list, saveDisplay, importTask };
