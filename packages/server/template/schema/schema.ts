import { __GAME__ } from '@template/__template__';

import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema(__GAME__);
