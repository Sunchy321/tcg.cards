import { ORPCError } from '@orpc/server';

import { readYugiohPublishTargetOverride } from '../../runtime-config';

/** Complete test remote target required by the Yu-Gi-Oh! publisher. */
export interface YugiohPublishTarget {
  game:              string;
  target:            string;
  targetFingerprint: string;
  connectionString:  string;
}

/** Optional target field normalized into a non-empty string or null. */
function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Complete test target returned only when every injected field is valid. */
export function getYugiohPublishTarget() {
  const override = readYugiohPublishTargetOverride();
  const game = trimToNull(override?.game);
  const target = trimToNull(override?.target);
  const targetFingerprint = trimToNull(override?.targetFingerprint);
  const connectionString = trimToNull(override?.connectionString);

  if (game == null || target == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    game,
    target,
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
