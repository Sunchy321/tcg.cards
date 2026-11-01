import type { auth } from '#server/lib/auth';
import type { MagicSearchD1Database } from '../search/d1/types';

export type HonoEnv = {
  Variables: {
    user:      typeof auth.$Infer.Session.user | null;
    session:   typeof auth.$Infer.Session.session | null;
    searchD1?: MagicSearchD1Database;
  };
};
