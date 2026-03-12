/**
 * Game-level locale stored in a cookie, independent of i18n UI locale.
 * The cookie key and available options are configured via app.config.ts.
 */
export const useGameLocale = () => {
  const appConfig = useAppConfig();

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
