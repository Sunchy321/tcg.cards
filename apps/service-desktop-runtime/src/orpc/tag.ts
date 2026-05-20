import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db/db';
import {
  tagConflictGetInput,
  tagConflictListInput,
  tagConflictListResult,
  tagConflictProfile,
  tagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import {
  getTagConflict,
  listTagConflicts,
  resolveTagConflict,
} from '@tcg-cards/console-api/lib/hearthstone/tag-conflict';

import { os } from './index';

/** Local desktop database URL required by runtime-backed tag conflict procedures. */
function requireLocalDatabaseUrl() {
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL?.trim();

  if (!connection) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'DESKTOP_LOCAL_DATABASE_URL is not configured',
    });
  }

  return connection;
}

/** Desktop-local Drizzle database used by runtime-backed tag conflict procedures. */
function getLocalDb() {
  return createDb(requireLocalDatabaseUrl());
}

/** Tag conflict procedures exposed by the desktop runtime for local replay handling. */
export const tagRouter = {
  listConflicts: os
    .route({
      method:      'GET',
      description: 'List local Hearthstone tag conflicts',
      tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
    })
    .input(tagConflictListInput)
    .output(tagConflictListResult)
    .handler(async ({ input }) => await listTagConflicts(getLocalDb(), input)),

  getConflict: os
    .route({
      method:      'GET',
      description: 'Get one local Hearthstone tag conflict',
      tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
    })
    .input(tagConflictGetInput)
    .output(tagConflictProfile)
    .handler(async ({ input }) => await getTagConflict(getLocalDb(), input.id)),

  resolveConflict: os
    .route({
      method:      'POST',
      description: 'Resolve one local Hearthstone tag conflict',
      tags:        ['Desktop Runtime', 'Hearthstone', 'Tag'],
    })
    .input(tagConflictResolveInput)
    .output(tagConflictProfile)
    .handler(async ({ input }) => await resolveTagConflict(getLocalDb(), input, {
      editorRuntime:  'desktop',
      editorIdentity: 'desktop-runtime',
      syncStatus:     'pending_push',
      conflictTarget: {
        processingSide:  'local',
        processingStage: 'apply',
      },
    })),
};
