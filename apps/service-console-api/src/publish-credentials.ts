import { GAMES, type Game } from '@tcg-cards/base';
import { gameDataPermission } from '@tcg-cards/auth';
import { createDb } from '@tcg-cards/db';
import { sql } from 'drizzle-orm';

import { getAuth } from './auth';

import type { ConsoleApiEnv } from './env';

/** Lifetime of one issued database credential in hours. */
const CREDENTIAL_TTL_HOURS = 4;

/** Role whose granted privileges define what a publish account may write. */
const DEFAULT_WRITER_ROLE = 'publish_writer';

/** Thrown when the service cannot issue credentials because it is not configured to. */
export class PublishCredentialUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishCredentialUnavailable';
  }
}

/** One issued publish credential the desktop connects with. */
export interface IssuedPublishCredential {
  connectionString:  string;
  /** Epoch milliseconds when the credential stops working. */
  expiresAt:         number;
  /** Stable identity of the destination the credential points at. */
  targetFingerprint: string;
}

/** One successful admission plus the credential it authorizes. */
export interface PublishCredentialGrant {
  userId:     string;
  credential: IssuedPublishCredential;
}

/** SHA-256 hex digest of one UTF-8 string. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** PostgreSQL identifier quoted with double quotes and embedded quotes doubled. */
function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Random password built from the URL-safe alphabet. */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(values, value => alphabet[value % alphabet.length]!).join('');
}

/** Fixed role name per account; short enough for PostgreSQL and stable across issuances. */
async function roleNameFor(userId: string): Promise<string> {
  return `publish_${(await sha256Hex(userId)).slice(0, 16)}`;
}

/**
 * Stable identity of the configured destination. It deliberately excludes the login
 * name because every issuance rotates it; the destination is host, port and database.
 */
export async function destinationFingerprint(databaseUrl: string): Promise<string> {
  const url = new URL(databaseUrl);
  return await sha256Hex([
    'publish-account',
    `host=${url.hostname.toLowerCase()}`,
    `port=${url.port || '5432'}`,
    `database=${decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres'}`,
  ].join('\n'));
}

/** Joins the remote host from the configured database URL with the issued role login. */
function buildCredentialConnectionString(databaseUrl: string, role: string, password: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  url.search = '';
  url.hash = '';
  // A connection without a database name would target a database named after the
  // login, so the destination database is always written explicitly.
  if (!url.pathname || url.pathname === '/') url.pathname = '/postgres';
  return url.toString();
}

/** Reports whether one game name is publishable through the service. */
export function isPublishableGame(game: string): game is Game {
  return (GAMES as readonly string[]).includes(game);
}

/**
 * Verifies the caller's session and per-game data permission, then issues one
 * short-lived credential for the account's fixed publish role.
 *
 * The role is created once and keeps fixed privileges; every issuance rotates its
 * password and moves `VALID UNTIL` forward. Issuance uses the service's own
 * privileged connection, never the request-scoped business connection.
 */
export async function grantPublishCredential(
  env: ConsoleApiEnv,
  headers: Headers,
  game: Game,
  origin: string,
): Promise<{ status: number, body: Record<string, unknown> }> {
  const auth = getAuth(env, { baseURL: origin });
  const session = await auth.api.getSession({ headers });
  if (session?.session == null) {
    return { status: 401, body: { allowed: false, message: '请先登录控制台服务。' } };
  }
  if (!gameDataPermission(session.user.role, game)) {
    return { status: 403, body: { allowed: false, message: '当前账号没有发布该游戏数据的权限。' } };
  }
  if (!env.PUBLISH_ADMIN_CONNECTION_STRING) {
    return { status: 503, body: { allowed: false, message: '服务未配置发布凭据签发。' } };
  }

  try {
    const credential = await issueCredential(env, session.user.id);
    return { status: 200, body: { allowed: true, userId: session.user.id, ...credential } };
  } catch (error) {
    const message = error instanceof PublishCredentialUnavailable
      ? error.message
      : '无法签发发布凭据，请检查数据库发布角色的配置。';
    return { status: 503, body: { allowed: false, message } };
  }
}

/**
 * Creates (once) the account's publish role and rotates its password.
 * The destination is the database the issuer itself manages: grants are
 * database-scoped, so the admin connection already names the publish database.
 */
async function issueCredential(
  env: ConsoleApiEnv,
  userId: string,
): Promise<IssuedPublishCredential> {
  const databaseUrl = env.PUBLISH_ADMIN_CONNECTION_STRING!;
  const admin = createDb(databaseUrl);
  const role = await roleNameFor(userId);
  const password = generatePassword();
  const validUntil = new Date(Date.now() + CREDENTIAL_TTL_HOURS * 60 * 60 * 1000);
  const writerRole = env.PUBLISH_WRITER_ROLE ?? DEFAULT_WRITER_ROLE;

  try {
    await admin.execute(sql.raw(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(role)}) THEN
    CREATE ROLE ${quoteIdent(role)} LOGIN;
  END IF;
END $$;`));
    await admin.execute(sql.raw(
      `ALTER ROLE ${quoteIdent(role)} LOGIN PASSWORD ${quoteLiteral(password)} VALID UNTIL ${quoteLiteral(validUntil.toISOString())};`,
    ));
    await admin.execute(sql.raw(`GRANT ${quoteIdent(writerRole)} TO ${quoteIdent(role)};`));
  } catch (error) {
    throw new PublishCredentialUnavailable(
      `签发发布凭据失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await admin.$client.end({ timeout: 0 });
  }

  return {
    connectionString:  buildCredentialConnectionString(databaseUrl, role, password),
    expiresAt:         validUntil.getTime(),
    targetFingerprint: await destinationFingerprint(databaseUrl),
  };
}

/** Quotes one string literal for an inline PostgreSQL statement. */
function quoteLiteral(value: string): string {
  return `'${value.replaceAll('\'', '\'\'')}'`;
}
