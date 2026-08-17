import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('yugioh');

export const dataSchema = pgSchema('yugioh_data');
