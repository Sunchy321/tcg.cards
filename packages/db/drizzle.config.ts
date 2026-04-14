import { defineConfig } from 'drizzle-kit';

import { GAMES } from '@tcg-cards/shared';

console.log('Drizzle config loaded with games:', GAMES);

export default defineConfig({
  dialect: 'postgresql',
  out:     './migrations',
  schema:  ['./src/schema/auth.ts', './src/schema/*/index.ts'],
  casing:  'snake_case',

  schemaFilter: [
    'public',
    ...GAMES,
    ...GAMES.map(g => `${g}_data`),
    ...GAMES.map(g => `${g}_app`),
    'omnisearch',
  ],

  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },

  verbose: true,
  strict:  true,
});
