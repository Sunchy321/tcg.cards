import { ORPCError } from '@orpc/server';

import { findPublishTargetByName } from '../../runtime-config';

/** Complete magic publish destination required by the publish workflow. */
export interface MagicPublishTarget {
  game:              string;
  target:            string;
  targetFingerprint: string;
  connectionString:  string;
}

/** Trims one optional publish-target field into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Requires one magic publish destination for the given stream identity, or fails with a 400. */
export function requireMagicPublishTarget(
  game: string,
  target: string,
): MagicPublishTarget {
  const configured = findPublishTargetByName(target);
  const name = trimToNull(configured?.name);
  const targetFingerprint = trimToNull(configured?.targetFingerprint);
  const connectionString = trimToNull(configured?.connectionString);

  if (name == null || targetFingerprint == null || connectionString == null) {
    throw new ORPCError('BAD_REQUEST', {
      message: `magic publish target ${target} is not configured or has not completed its first connection.`,
    });
  }

  return {
    game,
    target: name,
    targetFingerprint,
    connectionString,
  };
}
