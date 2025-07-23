import { configDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { games } from 'card-interface/src/index';

configDotenv();

export default defineConfig({
    dialect:      'postgresql',
    schema:       ['./src/*/schema/*.ts', './src/auth/schema.ts'],
    schemaFilter: ['public', ...games],
    casing:       'snake_case',

    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
