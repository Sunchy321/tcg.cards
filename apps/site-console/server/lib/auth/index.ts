import { createServerAuth } from '@tcg-cards/auth';

import { db } from '#db/db';
import { accounts, sessions, users, verifications } from '#schema/remote/auth';

export const auth = createServerAuth({
  database: db,
  schema:   {
    users,
    accounts,
    sessions,
    verifications,
  },
});
