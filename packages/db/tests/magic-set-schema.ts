/** Minimal Drizzle schema for isolated series-import integration databases. */
export { schema, dataSchema } from '../src/schema/shared/magic/schema';
export { locale } from '../src/schema/shared/magic/card';
export { Print } from '../src/schema/shared/magic/print';
export * from '../src/schema/shared/magic/set';
export { Format } from '../src/schema/shared/magic/format';
export { ScryfallSet } from '../src/schema/local/magic/data/scryfall';
export { MtgjsonSet } from '../src/schema/local/magic/data/mtgjson';
export { MtgchZhsSet } from '../src/schema/local/magic/data/mtgch';
export { SetDisplayChoice } from '../src/schema/local/magic/set-display';
