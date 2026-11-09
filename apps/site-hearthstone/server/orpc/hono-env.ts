import type { HearthstoneSearchD1Database } from '../search/d1/types';
import type { auth } from '#server/lib/auth';

/** Carries authenticated request state and the optional Hearthstone D1 search binding. */
export type HonoEnv = {
  Variables: {
    searchD1?: HearthstoneSearchD1Database;
    user:      typeof auth.$Infer.Session.user | null;
    session:   typeof auth.$Infer.Session.session | null;
  };
};
