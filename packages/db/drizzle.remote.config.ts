import { defineConfig } from 'drizzle-kit';

import { GAMES } from '@tcg-cards/shared';

console.log('Drizzle remote config loaded with games:', GAMES);
console.log('Database URL:', process.env.DATABASE_URL);

export default defineConfig({
  dialect: 'postgresql',
  out:     './migrations/remote',
  schema:  [
    './src/schema/remote/auth.ts',
    './src/schema/remote/hearthstone/index.ts',
    './src/schema/remote/magic/index.ts',
  ],
  casing: 'snake_case',

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
