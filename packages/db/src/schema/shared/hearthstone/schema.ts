import { pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('hearthstone');

export const dataSchema = pgSchema('hearthstone_data');
export const appSchema = pgSchema('hearthstone_app');
