import type { Configuration } from '../shared/settings';

/** One configured publish destination. */
export type PublishTargetConfig = Configuration['targets'][number];

/** Launch facts derived from a selected destination and its live database identity. */
export interface ResolvedPublishTarget {
  /** The stream label written to the remote registration and ledger. */
  environment:       string;
  targetFingerprint: string;
  /** True when this launch recorded the destination identity for the first time. */
  capture:           boolean;
}

/** Rejects destinations that this desktop cannot publish through yet. */
export function assertPublishTargetUsable(target: PublishTargetConfig): void {
  if (target.kind !== 'direct') {
    throw new Error('账户发布目标尚未启用，请改用直连目标。');
  }
}

/**
 * Compares the live database identity with the recorded one and decides the stream label.
 * A destination verified for the first time returns `capture` so the caller can persist it.
 */
export function resolvePublishTarget(
  target: PublishTargetConfig,
  liveFingerprint: string,
): ResolvedPublishTarget {
  assertPublishTargetUsable(target);
  if (target.targetFingerprint && target.targetFingerprint !== liveFingerprint) {
    throw new Error('当前连接指向的数据库与已保存的发布目标不一致，请检查连接设置。');
  }
  return {
    environment:       target.name,
    targetFingerprint: liveFingerprint,
    capture:           !target.targetFingerprint,
  };
}

/** Copies the resolved destination into one task launch payload. */
export function withResolvedPublishTarget(
  params: Record<string, unknown>,
  resolved: ResolvedPublishTarget,
) {
  return {
    ...params,
    environment:       resolved.environment,
    targetFingerprint: resolved.targetFingerprint,
  };
}
