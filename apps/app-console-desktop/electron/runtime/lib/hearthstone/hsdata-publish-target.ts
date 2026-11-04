import { ORPCError } from '@orpc/server';

import { findPublishTargetByName, readPublishTargets } from '../../runtime-config';

/** Complete Hearthstone publish target state required by desktop publishing. */
export interface HsdataPublishTarget {
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

/** Builds a complete publish target from one runtime-injected destination. */
function completeTarget(publishTarget: string, name: string | null | undefined) {
  const target = findPublishTargetByName(name);
  const resolvedName = trimToNull(target?.name);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (resolvedName == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    publishTarget,
    environment: resolvedName,
    targetFingerprint,
    connectionString,
  } satisfies HsdataPublishTarget;
}

/** Resolves the only configured target when a caller did not name one. */
function singleTargetName(): string | null {
  const names = readPublishTargets()
    .map(target => trimToNull(target.name))
    .filter((name): name is string => name != null);
  return names.length === 1 ? names[0]! : null;
}

/** Reads the current runtime-injected publish target when all required fields are present. */
export const getHearthstonePublishTarget = (publishTarget = 'hearthstone') => {
  return completeTarget(publishTarget, singleTargetName());
};

/** Reads one configured publish target that matches the requested identity. */
export const getHearthstonePublishTargetByIdentity = (
  publishTarget: string,
  environment: string,
) => completeTarget(publishTarget, environment);

/** Resolves the runtime-injected publish target or raises one RPC error with the missing fields. */
export const requireHearthstonePublishTarget = (publishTarget = 'hearthstone') => {
  const target = getHearthstonePublishTarget(publishTarget);

  if (target != null) {
    return target;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Hearthstone publish target is not configured. Select one publish target before publishing.',
  });
};

/** Resolves one matching publish target or raises one RPC error describing the missing identity. */
export const requireHearthstonePublishTargetByIdentity = (
  publishTarget: string,
  environment: string,
) => {
  const target = getHearthstonePublishTargetByIdentity(publishTarget, environment);

  if (target != null) {
    return target;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: `Hearthstone publish target ${environment} is not configured for ${publishTarget}.`,
  });
};
