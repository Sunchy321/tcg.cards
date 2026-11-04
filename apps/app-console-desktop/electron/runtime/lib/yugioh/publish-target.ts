import { ORPCError } from '@orpc/server';

import { findPublishTargetByName, readPublishTargets } from '../../runtime-config';

/** Complete remote destination required by the Yu-Gi-Oh! publisher. */
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

/** Resolves the only configured target when a caller did not name one. */
function singleTargetName(): string | null {
  const names = readPublishTargets()
    .map(target => trimToNull(target.name))
    .filter((name): name is string => name != null);
  return names.length === 1 ? names[0]! : null;
}

/** Complete target returned only when every injected field is valid. */
export function getYugiohPublishTarget(targetName?: string) {
  const target = findPublishTargetByName(targetName ?? singleTargetName());
  const name = trimToNull(target?.name);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (name == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    game:   'yugioh',
    target: name,
    targetFingerprint,
    connectionString,
  } satisfies YugiohPublishTarget;
}

/** Configured target returned or one safe configuration error raised. */
export function requireYugiohPublishTarget(targetName?: string) {
  const target = getYugiohPublishTarget(targetName);

  if (target != null) {
    return target;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Yu-Gi-Oh! publish target is not fully configured. Select a publish target before publishing.',
  });
}
