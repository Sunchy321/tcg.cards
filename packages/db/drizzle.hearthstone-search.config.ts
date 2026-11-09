import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect:       'sqlite',
  out:           './migrations/d1/hearthstone-search',
  schema:        './src/schema/sqlite/hearthstone/search.ts',
  casing:        'snake_case',
  dbCredentials: { url: 'file:./hearthstone-search.sqlite' },
  verbose:       true,
  strict:        true,
});
