import z from 'zod';

/** Describes the shared track name used by one game-data field policy. */
export const gameDataSyncTrack = z.enum(['publish-owned', 'collaborative']);

/** Describes the manual override mode applied after one manual acceptance. */
export const manualOverrideMode = z.enum(['manual_sticky', 'manual_until_source_change']);

/** Describes the publish-owned operation kind accepted by stream-level publish control. */
export const publishOperationKind = z.enum(['publish', 'repair', 'rollback', 'reanchor']);

/** Describes one stable publish stream identity shared by local and remote publish state. */
export const publishStream = z.strictObject({
  publishTarget: z.string().trim().min(1),
  environment: z.string().trim().min(1),
  publishType: z.string().trim().min(1),
});

/** Describes one minimal row baseline entry stored for one publish stream. */
export const publishRowBaseline = z.strictObject({
  rowKey: z.string().trim().min(1),
  rowHash: z.string(),
});

/** Describes one code-defined policy for a synced game-data field. */
export const gameDataFieldPolicy = z.strictObject({
  track: gameDataSyncTrack,
  allowManualEdit: z.boolean(),
  allowedAutoSources: z.array(z.string()),
  autoAcceptSources: z.array(z.string()),
  manualOverrideMode,
  requiresReview: z.boolean(),
});

/** Builds one deterministic string key from a publish stream identity. */
export function publishStreamKey(stream: PublishStream): string {
  return `${stream.publishTarget}:${stream.environment}:${stream.publishType}`;
}

/** Describes the shared track name used by one game-data field policy. */
export type GameDataSyncTrack = z.infer<typeof gameDataSyncTrack>;

/** Describes the manual override mode applied after one manual acceptance. */
export type ManualOverrideMode = z.infer<typeof manualOverrideMode>;

/** Describes the publish-owned operation kind accepted by stream-level publish control. */
export type PublishOperationKind = z.infer<typeof publishOperationKind>;

/** Describes one stable publish stream identity shared by local and remote publish state. */
export type PublishStream = z.infer<typeof publishStream>;

/** Describes one minimal row baseline entry stored for one publish stream. */
export type PublishRowBaseline = z.infer<typeof publishRowBaseline>;

/** Describes one code-defined policy for a synced game-data field. */
export type GameDataFieldPolicy = z.infer<typeof gameDataFieldPolicy>;
