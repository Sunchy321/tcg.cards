import { ORPCError } from '@orpc/server';

import { findPublishTargetByName } from '../../runtime-config';

/** Complete magic publish target state required by the publish workflow. */
export interface MagicPublishTarget {
  publishTarget:     string;
  environment:       string;
  targetFingerprint: string;
  connectionString:  string;
}

/** Trims one optional publish-target field into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Requires one magic publish target for the given stream identity, or fails with a 400. */
export function requireMagicPublishTargetByIdentity(
  publishTarget: string,
  environment: string,
): MagicPublishTarget {
  const configured = findPublishTargetByName(environment);
  const name = trimToNull(configured?.name);
  const targetFingerprint = trimToNull(configured?.targetFingerprint);
  const connectionString = trimToNull(configured?.connectionString);

  if (name == null || targetFingerprint == null || connectionString == null) {
    throw new ORPCError('BAD_REQUEST', {
      message: `magic publish target ${environment} is not configured or has not completed its first connection.`,
    });
  }

  return {
    publishTarget,
    environment: name,
    targetFingerprint,
    connectionString,
  };
}
