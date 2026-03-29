import type { R2Bucket } from '@cloudflare/workers-types';
import type { auth } from '#server/lib/auth';

export type HonoEnv = {
  Bindings: {
    R2_DATA:         R2Bucket;
    R2_ASSET:        R2Bucket;
    R2_DATA_BUCKET:  string;
    R2_ASSET_BUCKET: string;
  };
  Variables: {
    user:    typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
};
