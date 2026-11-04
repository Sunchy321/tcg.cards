import type { Configuration } from '../shared/settings';

/** One configured publish destination. */
export type PublishTargetConfig = Configuration['targets'][number];

/** Launch facts derived from a selected destination and the identity it was verified against. */
export interface ResolvedPublishTarget {
  /** The stream label written to the remote registration and ledger. */
  target:            string;
  targetFingerprint: string;
  /** True when this launch recorded the destination identity for the first time. */
  capture:           boolean;
}

/**
 * Compares the destination identity with the recorded one and decides the stream label.
 * A destination verified for the first time returns `capture` so the caller can persist it.
 * Direct targets compare a locally read fingerprint; account targets compare the
 * identity the console service reported with the issued credential.
 */
export function resolvePublishTarget(
  target: PublishTargetConfig,
  fingerprint: string,
): ResolvedPublishTarget {
  if (target.targetFingerprint && target.targetFingerprint !== fingerprint) {
    throw new Error('当前连接指向的数据库与已保存的发布目标不一致，请检查连接设置。');
  }
  return {
    target:            target.name,
    targetFingerprint: fingerprint,
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
    target:            resolved.target,
    targetFingerprint: resolved.targetFingerprint,
  };
}

/** Resolves a D1 publication destination without accepting direct database connections. */
export function resolveSearchD1Target(targets: PublishTargetConfig[], id: string): PublishTargetConfig {
  const target = targets.find(candidate => candidate.id === id);
  if (target?.kind !== 'account') {
    throw new Error('请选择账户发布目标后再发布远程搜索库。');
  }
  return target;
}
