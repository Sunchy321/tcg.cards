import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { createServerAuth } from '@tcg-cards/auth';

type Auth = ReturnType<typeof createServerAuth>;

export type HonoEnv = {
  Bindings: {
    R2_DATA:               R2Bucket;
    R2_ASSET:              R2Bucket;
    R2_DATA_BUCKET:        string;
    R2_ASSET_BUCKET:       string;
    MAGIC_SEARCH_DB:       D1Database;
    HEARTHSTONE_SEARCH_DB: D1Database;
  };
  Variables: {
    user:    Auth['$Infer']['Session']['user'] | null;
    session: Auth['$Infer']['Session']['session'] | null;
  };
};
