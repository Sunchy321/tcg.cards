import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('magic');

export const dataSchema = pgSchema('magic_data');
export const appSchema = pgSchema('magic_app');
