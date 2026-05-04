export interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  head(key: string): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
  list(input: { prefix: string, cursor?: string }): Promise<{
    cursor?:    string;
    truncated?: boolean;
    objects?:   Array<{ key: string, size: number, uploaded?: Date }>;
  }>;
}

export interface InternalServiceEnv {
  BETTER_AUTH_SECRET: string;
  HYPERDRIVE: {
    connectionString: string;
  };
  R2_DATA:         R2Bucket;
  R2_ASSET:        R2Bucket;
  R2_ASSET_BUCKET: string;
}
