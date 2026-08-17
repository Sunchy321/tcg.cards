import { ORPCError } from '@orpc/server';

import { readYugiohPublishTargetOverride } from '../../runtime-config';

/** Complete test remote target required by the Yu-Gi-Oh! publisher. */
export interface YugiohPublishTarget {
  publishTargetId: string;
  environment: 'test';
  targetFingerprint: string;
  connectionString: string;
}

/** Optional target field normalized into a non-empty string or null. */
function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Complete test target returned only when every injected field is valid. */
export function getYugiohPublishTarget() {
  const target = readYugiohPublishTargetOverride();
  const publishTargetId = trimToNull(target?.publishTargetId);
  const environment = trimToNull(target?.environment);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (publishTargetId == null || environment == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  if (environment !== 'test') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Yu-Gi-Oh! publication is restricted to the test environment.',
    });
  }

  return {
    publishTargetId,
    environment,
    targetFingerprint,
    connectionString,
  } satisfies YugiohPublishTarget;
}

/** Configured test target returned or one safe configuration error raised. */
export function requireYugiohPublishTarget() {
  const target = getYugiohPublishTarget();

  if (target != null) {
    return target;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Yu-Gi-Oh! test publish target is not fully configured.',
  });
}
