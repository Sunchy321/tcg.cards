import type { Game } from '~~/shared';

import type { Locale as MagicLocale } from '#model/magic/schema/basic';

import { locale as magicLocale } from '#model/magic/schema/basic';

import z from 'zod';

type Locale<G extends Game> = {
  magic:       MagicLocale;
  hearthstone: 'en';
}[G];

const schemas = {
  magic:       magicLocale,
  hearthstone: z.enum(['en']),
} as const;

const resolveDefaultLocale = (
  localeSchema: (typeof schemas)[Game],
  currentLocale: string,
) => {
  return localeSchema.safeParse(currentLocale).data ?? localeSchema.options[0]!;
};

export const useGameLocale = (game: Game) => {
  const i18n = useI18n();
  const localeSchema = schemas[game];

  const locale = useCookie<Locale<Game>>(`${game}_locale`, {
    default: () => resolveDefaultLocale(localeSchema, i18n.locale.value),
    decode:  value => resolveDefaultLocale(localeSchema, value),
    encode:  value => resolveDefaultLocale(localeSchema, value),
  });

  return locale;
};
