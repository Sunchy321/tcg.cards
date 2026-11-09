import { auth } from '~~/server/lib/auth';

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const headers = getRequestHeaders(event) as Record<string, string>;

  // Resolve the authenticated user from the session cookie first.
  const session = await auth.api.getSession({ headers });

  if (!session?.user.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // Create server-side (no headers) so server-only fields like permissions are allowed.
  // userId comes from the session, so a user can only create keys for themselves.
  const result = await auth.api.createApiKey({
    body: {
      name:        body.name,
      permissions: body.permissions,
      userId:      session.user.id,
    },
  });

  return result;
});
