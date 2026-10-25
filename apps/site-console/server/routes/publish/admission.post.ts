import { z } from 'zod';
import { GAMES } from '@tcg-cards/base';
import { gameDataPermission } from '@tcg-cards/auth';

import { auth } from '../../lib/auth';

const body = z.strictObject({ game: z.enum(GAMES) });

/**
 * Authoritative publish admission for desktop publishers: the logged-in
 * account must hold the target game's data permission.
 */
export default defineEventHandler(async event => {
  const parsed = body.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    setResponseStatus(event, 400, 'Invalid admission request');
    return { allowed: false };
  }
  const session = await auth.api.getSession({ headers: new Headers(getRequestHeaders(event) as Record<string, string>) });
  if (!session) {
    setResponseStatus(event, 401, 'Login required');
    return { allowed: false };
  }
  if (!gameDataPermission(session.user.role, parsed.data.game)) {
    setResponseStatus(event, 403, 'Forbidden');
    return { allowed: false };
  }
  return { allowed: true, game: parsed.data.game, username: session.user.username ?? session.user.name };
});
