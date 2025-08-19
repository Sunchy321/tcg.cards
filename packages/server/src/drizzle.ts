import { drizzle } from 'drizzle-orm/node-postgres';
// import { drizzle } from 'drizzle-orm/bun-sql';

export const db = drizzle(process.env.DATABASE_URL!, { casing: 'snake_case' });
