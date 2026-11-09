export interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  head(key: string): Promise<{ size: number } | null>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
  list(input: { prefix: string, cursor?: string }): Promise<{
    cursor?:    string;
    truncated?: boolean;
    objects?:   Array<{ key: string, size: number, uploaded?: Date }>;
  }>;
}

/** Bound Cloudflare D1 search database the publisher may address. */
export type D1SearchDatabase = import('@cloudflare/workers-types').D1Database;

export interface ConsoleApiEnv {
  BETTER_AUTH_SECRET: string;
  HYPERDRIVE: {
    connectionString: string;
  };
  R2_DATA:                          R2Bucket;
  R2_ASSET:                         R2Bucket;
  R2_ASSET_BUCKET:                  string;
  MAGIC_SEARCH_DB:                  D1SearchDatabase;
  HEARTHSTONE_SEARCH_DB:            D1SearchDatabase;
  /** Privileged direct database connection used only to issue publish credentials. */
  PUBLISH_ADMIN_CONNECTION_STRING?: string;
  /** Role whose granted privileges a publish account receives. Defaults to `publish_writer`. */
  PUBLISH_WRITER_ROLE?:             string;
  /** Bucket the search packages are published into. */
  R2_DATA_BUCKET:                   string;
  /** Account id of the R2 S3 endpoint used to sign upload URLs. */
  R2_S3_ACCOUNT_ID?:                string;
  /** R2 S3 credentials used only to sign short-lived upload URLs. */
  R2_S3_ACCESS_KEY_ID?:             string;
  R2_S3_SECRET_ACCESS_KEY?:         string;
}
