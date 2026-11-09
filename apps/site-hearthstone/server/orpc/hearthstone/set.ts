import { os } from '@orpc/server';

import { db } from '#db/db';
import { Set } from '#schema/shared/hearthstone/set';
import { set } from '#model/hearthstone/schema/set';

const list = os
  .output(set.array())
  .handler(async () => db.select().from(Set).orderBy(Set.releaseDate, Set.setId));

export const setTrpc = { list };
