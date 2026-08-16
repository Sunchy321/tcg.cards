import { ORPCError } from '@orpc/server';

import {
  readHearthstonePublishTargetOverride,
  readHearthstonePublishTargetOverrides,
} from '../../runtime-config';

/** Complete Hearthstone publish target state required by the Bun publish workflow. */
export interface HsdataPublishTarget {
  publishTarget: string;
  environment: string;
  targetFingerprint: string;
  connectionString: string;
}

/** Trims one optional publish-target field into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** One runtime-injected publish target normalized only when every required field is present. */
const normalizePublishTarget = (
  target: ReturnType<typeof readHearthstonePublishTargetOverride>,
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
  } satisfies HsdataPublishTarget;
};

/** Lists the missing publish-target fields required before Bun can execute a publish. */
const listMissingFields = (
  target: ReturnType<typeof readHearthstonePublishTargetOverride>,
) => {
  const missing: string[] = [];

  if (trimToNull(target?.publishTarget) == null) {
    missing.push('publishTarget');
  }

  if (trimToNull(target?.environment) == null) {
    missing.push('environment');
  }

  if (trimToNull(target?.targetFingerprint) == null) {
    missing.push('targetFingerprint');
  }

  if (trimToNull(target?.connectionString) == null) {
    missing.push('connectionString');
  }

  return missing;
};

/** Reads the current runtime-injected publish target when all required fields are present. */
export const getHearthstonePublishTarget = () => {
  return normalizePublishTarget(readHearthstonePublishTargetOverride());
};

/** Lists every runtime-injected publish target that is fully configured. */
export const listHearthstonePublishTargets = () => {
  return readHearthstonePublishTargetOverrides()
    .map(target => normalizePublishTarget(target))
    .filter((target): target is HsdataPublishTarget => target != null);
};

/** Reads one configured publish target that matches the requested identity. */
export const getHearthstonePublishTargetByIdentity = (
  publishTarget: string,
  environment: string,
) => {
  const expectedPublishTarget = trimToNull(publishTarget);
  const expectedEnvironment = trimToNull(environment);

  if (expectedPublishTarget == null || expectedEnvironment == null) {
    return null;
  }

  return listHearthstonePublishTargets().find(target => {
    return target.publishTarget === expectedPublishTarget
      && target.environment === expectedEnvironment;
  }) ?? null;
};

/** Resolves the runtime-injected publish target or raises one RPC error with the missing fields. */
export const requireHearthstonePublishTarget = () => {
  const target = getHearthstonePublishTarget();

  if (target != null) {
    return target;
  }

  const missing = listMissingFields(readHearthstonePublishTargetOverride());

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message: `Hearthstone publish target is not configured: missing ${missing.join(', ')}`,
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
    message: `Hearthstone publish target is not configured for ${publishTarget}/${environment}.`,
  });
};
