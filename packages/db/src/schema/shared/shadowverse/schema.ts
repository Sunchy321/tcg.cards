import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('shadowverse');

export const dataSchema = pgSchema('shadowverse_data');
