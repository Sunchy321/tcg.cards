import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';

/** Temporary Drizzle client used for one runtime database inspection task. */
type RuntimeDb = ReturnType<typeof createDb>;

/** Identity row loaded from one PostgreSQL session. */
interface DesktopDatabaseIdentity {
  databaseName: string;
  userName: string;
  serverHost: string | null;
  serverPort: number | null;
}

/** Frontend local database test result resolved through the Bun runtime. */
export interface DesktopDatabaseConnectionTestResult {
  databaseName: string;
  userName: string;
}

/** Publish target resolution result returned from one live PostgreSQL session. */
export interface ResolvedHearthstonePublishTarget {
  publishTargetId: string;
  environment: string;
  targetFingerprint: string;
  databaseName: string;
  userName: string;
  serverHost: string;
  serverPort: number;
}

/** Normalized network endpoint extracted for one PostgreSQL target. */
interface PostgresTargetEndpoint {
  host: string;
  port: number;
}

/** Raw identity query row loaded through Drizzle. */
type DatabaseIdentityRow = Record<string, unknown> & {
  databaseName: string;
  userName: string;
  serverHost: string | null;
  serverPort: number | null;
};

/** Lowercase hexadecimal SHA-256 digest computed from one text input. */
function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

/** Leading and trailing single or double quotes removed from one parsed connection value. */
function trimConnectionValue(value: string) {
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, '');
}

/** PostgreSQL endpoint parsed from one URL-style connection string. */
function parsePostgresEndpointFromUrl(connectionString: string): PostgresTargetEndpoint | null {
  const url = URL.parse(connectionString);

  if (url == null || !['postgres', 'postgresql'].includes(url.protocol.replace(/:$/, ''))) {
    return null;
  }

  const host = (url.hostname.trim() || url.searchParams.get('host')?.trim() || '').toLowerCase();
  const rawPort = url.port || url.searchParams.get('port') || '';
  const port = Number.parseInt(rawPort, 10);

  if (!host || !Number.isInteger(port) || port <= 0) {
    return null;
  }

  return { host, port };
}

/** PostgreSQL endpoint parsed from one keyword connection string. */
function parsePostgresEndpointFromKeywords(connectionString: string): PostgresTargetEndpoint | null {
  let host: string | null = null;
  let port: number | null = null;

  for (const part of connectionString.split(/\s+/)) {
    const [key, rawValue] = part.split('=');

    if (key == null || rawValue == null) {
      continue;
    }

    const value = trimConnectionValue(rawValue);

    if (key === 'host' && value) {
      host = value.toLowerCase();
      continue;
    }

    if (key === 'port') {
      const parsed = Number.parseInt(value, 10);

      if (Number.isInteger(parsed) && parsed > 0) {
        port = parsed;
      }
    }
  }

  if (host == null) {
    return null;
  }

  return {
    host,
    port: port ?? 5432,
  };
}

/** PostgreSQL endpoint parsed from one connection string when the live session omits host data. */
function parsePostgresEndpoint(connectionString: string) {
  return parsePostgresEndpointFromUrl(connectionString)
    ?? parsePostgresEndpointFromKeywords(connectionString);
}

/** Publish target endpoint resolved from one live session identity plus connection-string fallback. */
function resolveTargetEndpoint(identity: DesktopDatabaseIdentity, connectionString: string): PostgresTargetEndpoint {
  const parsed = parsePostgresEndpoint(connectionString);
  const host = identity.serverHost?.trim().toLowerCase()
    || parsed?.host
    || 'local-socket';
  const port = identity.serverPort
    ?? parsed?.port
    ?? 5432;

  return { host, port };
}

/** Stable fingerprint derived from one resolved PostgreSQL endpoint and identity pair. */
function computeTargetFingerprint(endpoint: PostgresTargetEndpoint, identity: DesktopDatabaseIdentity) {
  return sha256Hex([
    `host=${endpoint.host}`,
    `port=${endpoint.port}`,
    `database=${identity.databaseName}`,
    `user=${identity.userName}`,
  ].join('\n'));
}

/** One short-lived Drizzle client closed after the provided handler finishes. */
async function withDatabase<T>(connectionString: string, handler: (db: RuntimeDb) => Promise<T>) {
  const db = createDb(connectionString);

  try {
    return await handler(db);
  } finally {
    await db.$client.end({ timeout: 1 });
  }
}

/** PostgreSQL identity loaded through one temporary Drizzle client. */
async function readDesktopDatabaseIdentity(connectionString: string): Promise<DesktopDatabaseIdentity> {
  return await withDatabase(connectionString, async db => {
    const rows = await db.execute<DatabaseIdentityRow>(sql`
      select
        current_database()::text as "databaseName",
        current_user::text as "userName",
        inet_server_addr()::text as "serverHost",
        coalesce(inet_server_port(), nullif(current_setting('port', true), '')::integer) as "serverPort"
    `);
    const row = rows[0];

    if (row == null) {
      throw new Error('Failed to load PostgreSQL identity.');
    }

    return {
      databaseName: row.databaseName,
      userName: row.userName,
      serverHost: row.serverHost,
      serverPort: row.serverPort,
    };
  });
}

/** Local database connection test result resolved from one explicit connection string. */
export async function testDesktopDatabaseConnection(connectionString: string): Promise<DesktopDatabaseConnectionTestResult> {
  const identity = await readDesktopDatabaseIdentity(connectionString);

  return {
    databaseName: identity.databaseName,
    userName: identity.userName,
  };
}

/** Publish target identity and fingerprint resolved from one explicit connection string. */
export async function resolveHearthstonePublishTarget(input: {
  publishTargetId: string;
  environment: string;
  connectionString: string;
}): Promise<ResolvedHearthstonePublishTarget> {
  const identity = await readDesktopDatabaseIdentity(input.connectionString);
  const endpoint = resolveTargetEndpoint(identity, input.connectionString);

  return {
    publishTargetId: input.publishTargetId,
    environment: input.environment,
    targetFingerprint: computeTargetFingerprint(endpoint, identity),
    databaseName: identity.databaseName,
    userName: identity.userName,
    serverHost: endpoint.host,
    serverPort: endpoint.port,
  };
}
