/**
 * Game-level locale stored in a cookie, independent of i18n UI locale.
 * Requires `gameId` to be configured in app.config.ts.
 */
export const useGameLocale = () => {
  const appConfig = useAppConfig();

  if (!appConfig.gameId) {
    throw new Error('useGameLocale requires `gameId` in app.config.ts');
  }

  const locales = appConfig.locales ?? ['en'];
  const cookieKey = `${appConfig.gameId}_locale`;

  const resolveLocale = (value: string): string =>
    locales.find(l => l === value) ?? locales[0] ?? value;

  const locale = useCookie<string>(cookieKey, {
    domain:  import.meta.dev ? undefined : '.tcg.cards',
    default: () => locales[0] ?? '',
    decode:  value => resolveLocale(value),
    encode:  value => resolveLocale(value),
  });

  return locale;
};
