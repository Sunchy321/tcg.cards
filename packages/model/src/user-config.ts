import { z } from 'zod';

import { locale as magicLocale } from './magic/schema/basic';
import { locale as hearthstoneLocale } from './hearthstone/schema/basic';

export const locale = z.enum(['en', 'zhs']);

export const globalConfig = z.strictObject({
  lang:        locale.default('zhs'),
  gameLocales: z.record(z.string(), z.string()).default({}),
  theme:       z.enum(['light', 'dark', 'auto']).default('auto'),
}).strip();

export type GlobalConfig = z.infer<typeof globalConfig>;

export const magicConfig = z.strictObject({
  locale:       magicLocale.default('en'),
  searchLayout: z.enum(['grid', 'list', 'table']).default('grid'),
}).strip();

export type MagicConfig = z.infer<typeof magicConfig>;

export const hearthstoneConfig = z.strictObject({
  locale:       hearthstoneLocale.default('zhs'),
  searchLayout: z.enum(['grid', 'list', 'table']).default('grid'),
}).strip();

export type HearthstoneConfig = z.infer<typeof hearthstoneConfig>;
