import z from 'zod';

const nullableText = z.string().nullable();

export const fieldCommitProfile = z.strictObject({
    id:                     z.string().uuid(),
    sequence:               z.int().nonnegative(),
    entityType:             z.string(),
    entityKey:              z.record(z.string(), z.unknown()),
    fieldPath:              z.string(),
    value:                  z.unknown().nullable(),
    operation:              z.string(),
    commitKind:             z.string(),
    clientMutationId:       z.string(),
    editorRuntime:          z.string(),
    editorIdentity:         nullableText,
    expectedRowRevision:    z.string(),
    expectedWinnerRevision: nullableText,
    baseRevision:           z.string(),
    reviewStatus:           z.string(),
    reviewedBy:             nullableText,
    reviewedAt:             z.string().nullable(),
    reviewReason:           nullableText,
    projectionStatus:       z.string(),
    syncStatus:             z.string(),
    createdAt:              z.string(),
    projectedAt:            z.string().nullable(),
});

export const fieldCommitListInput = z.strictObject({
    entityType:   z.string().trim().max(64).optional(),
    entityKey:    z.record(z.string(), z.unknown()).optional(),
    fieldPath:    z.string().trim().max(200).optional(),
    commitKind:   z.string().trim().max(64).optional(),
    reviewStatus: z.string().trim().max(64).optional(),
    syncStatus:   z.string().trim().max(64).optional(),
    page:         z.int().positive().default(1),
    limit:        z.int().positive().max(200).default(50),
});

export const fieldCommitListResult = z.strictObject({
    items: z.array(fieldCommitProfile),
    total: z.int().nonnegative(),
    page:  z.int().positive(),
    limit: z.int().positive(),
});

export const fieldCommitGetInput = z.strictObject({
    id: z.uuid(),
});

/** Describes one field-level change projected from commit history. */
export type FieldCommitProfile = z.infer<typeof fieldCommitProfile>;

/** Describes one paginated field-commit query. */
export type FieldCommitListInput = z.infer<typeof fieldCommitListInput>;

/** Describes one paginated field-commit result set. */
export type FieldCommitListResult = z.infer<typeof fieldCommitListResult>;

/** Describes one field-commit lookup by id. */
export type FieldCommitGetInput = z.infer<typeof fieldCommitGetInput>;
