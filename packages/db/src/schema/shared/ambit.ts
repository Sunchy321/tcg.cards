import { pgEnum } from 'drizzle-orm/pg-core';

import { ambit as ambitModel } from '#model/ambit';

/**
 * The universal card ambit (CONTEXT.md "card ambit", ADR 0015) as one
 * public-domain enum shared by every game's card tables. Declaration order is
 * the ladder order, so comparisons double as ambit-ceiling tests.
 */
export const ambit = pgEnum('ambit', ambitModel.enum);
