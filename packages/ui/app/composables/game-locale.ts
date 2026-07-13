/**
 * Game-level locale read from global config gameLocales.
 * Requires `gameId` to be configured in app.config.ts.
 */
export const useGameLocale = () => {
  const appConfig = useAppConfig();

  if (!appConfig.gameId) {
    throw new Error('useGameLocale requires `gameId` in app.config.ts');
  }

  const defaultLocale = appConfig.defaultLocale ?? appConfig.locales?.[0] ?? 'en';
  const { config: globalConfig } = useGlobalConfig();

  return computed(() => (globalConfig.value.gameLocales[appConfig.gameId as string] as string) ?? defaultLocale);
};
