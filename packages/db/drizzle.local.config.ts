import { defineConfig } from 'drizzle-kit';

import { GAMES } from '@tcg-cards/shared';

console.log('Drizzle local config loaded with games:', GAMES);
console.log('Database URL:', process.env.DATABASE_URL);

export default defineConfig({
  dialect: 'postgresql',
  out:     './migrations/local',
  schema:  [
    './src/schema/local/index.ts',
    './src/schema/local/hearthstone/index.ts',
    './src/schema/local/magic/index.ts',
  ],
  casing: 'snake_case',

  schemaFilter: [
    'public',
    ...GAMES,
    ...GAMES.map(g => `${g}_data`),
  ],

  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },

  verbose: true,
  strict:  true,
});
