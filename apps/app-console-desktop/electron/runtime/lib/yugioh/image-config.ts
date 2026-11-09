import { ORPCError } from '@orpc/server';

import { readYugiohImageOverride } from '../../runtime-config';

/** Configured local Yu-Gi-Oh! asset bucket returned or one readable RPC error raised. */
export function requireYugiohImageBucketDir() {
  const bucketDir = readYugiohImageOverride()?.bucketDir?.trim();

  if (bucketDir != null && bucketDir.length > 0) {
    return bucketDir;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Yu-Gi-Oh! local image bucket directory is not configured.',
  });
}
