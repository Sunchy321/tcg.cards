import { ORPCError } from '@orpc/server';

import {
  readMagicPublishTargetOverrides,
} from '../../runtime-config';

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

/** One runtime-injected publish target normalized only when every required field is present. */
const normalizePublishTarget = (
  target: ReturnType<typeof readMagicPublishTargetOverrides>[number],
) => {
  const publishTarget = trimToNull(target?.publishTarget);
  const environment = trimToNull(target?.environment);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (publishTarget == null || environment == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    publishTarget,
    environment,
    targetFingerprint,
    connectionString,
  } satisfies MagicPublishTarget;
};

/** Lists the missing publish-target fields required before magic publish can run. */
const listMissingFields = () => {
  const missing: string[] = [];
  if (!readMagicPublishTargetOverrides().some(target => normalizePublishTarget(target) != null)) {
    missing.push('publishTarget', 'environment', 'targetFingerprint', 'connectionString');
  }
  return missing;
};

/** Requires one magic publish target for the given stream identity, or fails with a 400. */
export function requireMagicPublishTargetByIdentity(
  publishTarget: string,
  environment: string,
): MagicPublishTarget {
  const match = readMagicPublishTargetOverrides()
    .map(normalizePublishTarget)
    .find(target => target?.publishTarget === publishTarget && target?.environment === environment);

  if (match == null) {
    throw new ORPCError('BAD_REQUEST', {
      message: `magic publish target ${publishTarget}/${environment} is not configured (missing: ${listMissingFields().join(', ')})`,
    });
  }
  return match;
}

/** Lists every complete magic publish target override. */
export function listMagicPublishTargets(): MagicPublishTarget[] {
  return readMagicPublishTargetOverrides()
    .map(normalizePublishTarget)
    .filter((target): target is MagicPublishTarget => target != null);
}
