import { ORPCError } from '@orpc/server';

import { findPublishTargetByName, readPublishTargets } from '../../runtime-config';

/** Complete Hearthstone publish destination required by desktop publishing. */
export interface HsdataPublishTarget {
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

/** Builds a complete publish destination from one runtime-injected target name. */
function completeTarget(game: string, name: string | null | undefined) {
  const target = findPublishTargetByName(name);
  const resolvedName = trimToNull(target?.name);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (resolvedName == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    game,
    target: resolvedName,
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

/** Reads the current runtime-injected publish destination when all required fields are present. */
export const getHearthstonePublishTarget = (game = 'hearthstone') => {
  return completeTarget(game, singleTargetName());
};

/** Reads one configured publish destination that matches the requested identity. */
export const getHearthstonePublishTargetByIdentity = (
  game: string,
  target: string,
) => completeTarget(game, target);

/** Resolves the runtime-injected publish destination or raises one RPC error. */
export const requireHearthstonePublishTarget = (game = 'hearthstone') => {
  const target = getHearthstonePublishTarget(game);

  if (target != null) {
    return target;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: 'Hearthstone publish target is not configured. Select one publish target before publishing.',
  });
};

/** Resolves one matching publish destination or raises one RPC error describing the missing identity. */
export const requireHearthstonePublishTargetByIdentity = (
  game: string,
  target: string,
) => {
  const resolved = getHearthstonePublishTargetByIdentity(game, target);

  if (resolved != null) {
    return resolved;
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: `Hearthstone publish target ${target} is not configured for ${game}.`,
  });
};
