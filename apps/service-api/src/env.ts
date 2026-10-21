export interface ApiServiceEnv {
  ASSET_BASE_URL?:    string;
  BETTER_AUTH_SECRET: string;
  HYPERDRIVE: {
    connectionString: string;
  };
}
