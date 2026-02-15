import { configDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { games } from '@model/schema';

configDotenv();

export default defineConfig({
    dialect: 'postgresql',
    schema:  ['./src/*/schema/**/*.ts', './src/auth/schema.ts'],
    casing:  'snake_case',

    schemaFilter: [
        'public',
        ...games,
        ...games.map(g => `${g}_data`),
        ...games.map(g => `${g}_app`),
        'omnisearch',
    ],

    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
