import { configDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { games } from '@model/schema';

configDotenv();

export default defineConfig({
    dialect:      'postgresql',
    schema:       ['./src/*/schema/**/*.ts', './src/auth/schema.ts'],
    schemaFilter: ['public', 'omnisearch', ...games],
    casing:       'snake_case',

    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
