import { ORPCError } from '@orpc/server';

import { readHearthstonePublishTargetOverride } from '../../runtime-config';

/** Complete Hearthstone publish target state required by the Bun publish workflow. */
export interface HsdataPublishTarget {
  publishTargetId: string;
  environment: string;
  targetFingerprint: string;
  connectionString: string;
}

/** Trims one optional publish-target field into a nullable non-empty string. */
const trimToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Lists the missing publish-target fields required before Bun can execute a publish. */
const listMissingFields = (
  target: ReturnType<typeof readHearthstonePublishTargetOverride>,
) => {
  const missing: string[] = [];

  if (trimToNull(target?.publishTargetId) == null) {
    missing.push('publishTargetId');
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
  const target = readHearthstonePublishTargetOverride();
  const publishTargetId = trimToNull(target?.publishTargetId);
  const environment = trimToNull(target?.environment);
  const targetFingerprint = trimToNull(target?.targetFingerprint);
  const connectionString = trimToNull(target?.connectionString);

  if (publishTargetId == null || environment == null || targetFingerprint == null || connectionString == null) {
    return null;
  }

  return {
    publishTargetId,
    environment,
    targetFingerprint,
    connectionString,
  } satisfies HsdataPublishTarget;
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
