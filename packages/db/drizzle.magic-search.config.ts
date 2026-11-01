import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect:       'sqlite',
  out:           './migrations/d1/magic-search',
  schema:        './src/schema/sqlite/magic/search.ts',
  casing:        'snake_case',
  dbCredentials: {
    url: 'file:./magic-search.sqlite',
  },
  verbose: true,
  strict:  true,
});
