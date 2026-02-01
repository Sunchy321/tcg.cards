import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('magic');

export const appSchema = pgSchema('magic_app');
