import { ORPCError } from '@orpc/server';

import {
  readMagicPublishTargetOverrides,
} from '../../runtime-config';

/** Complete magic publish target state required by the publish workflow. */
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

/** One runtime-injected publish target normalized only when every required field is present. */
const normalizePublishTarget = (
  override: ReturnType<typeof readMagicPublishTargetOverrides>[number],
) => {
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
  } satisfies MagicPublishTarget;
};

/** Lists the missing publish-target fields required before magic publish can run. */
const listMissingFields = () => {
  const missing: string[] = [];
  if (!readMagicPublishTargetOverrides().some(target => normalizePublishTarget(target) != null)) {
    missing.push('game', 'target', 'targetFingerprint', 'connectionString');
  }
  return missing;
};

/** Requires one magic publish target for the given stream identity, or fails with a 400. */
export function requireMagicPublishTargetByIdentity(
  game: string,
  target: string,
): MagicPublishTarget {
  const match = readMagicPublishTargetOverrides()
    .map(normalizePublishTarget)
    .find(candidate => candidate?.game === game && candidate?.target === target);

  if (match == null) {
    throw new ORPCError('BAD_REQUEST', {
      message: `magic publish target ${game}/${target} is not configured (missing: ${listMissingFields().join(', ')})`,
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
