import { ORPCError } from '@orpc/server';

import { findPublishTargetByName } from '../../runtime-config';

/** Complete magic publish destination required by the publish workflow. */
export interface MagicPublishTarget {
  game:              string;
  target:            string;
  kind:              'direct' | 'account';
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

  if (configured == null || name == null || targetFingerprint == null || connectionString == null) {
    throw new ORPCError('BAD_REQUEST', {
      message: `magic publish target ${target} is not configured or has not completed its first connection.`,
    });
  }

  return {
    game,
    target: name,
    kind:   configured.kind,
    targetFingerprint,
    connectionString,
  };
}

/** Verifies the live identity for direct destinations while retaining account-issued fingerprints. */
export function verifyMagicPublishTargetFingerprint(target: MagicPublishTarget, liveFingerprint: string): void {
  // Account fingerprints come from the issuer and exclude the temporary login used by the runtime.
  if (target.kind === 'account') {
    return;
  }

  if (liveFingerprint !== target.targetFingerprint) {
    throw new ORPCError('BAD_REQUEST', { message: '发布目标与保存的配置不一致，请重新确认发布配置。' });
  }
}
