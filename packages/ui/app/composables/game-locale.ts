/**
 * Game-level locale read from global config gameLocales.
 * Requires `gameId` to be configured in app.config.ts.
 */
export const useGameLocale = () => {
  const appConfig = useAppConfig();

  if (!appConfig.gameId) {
    throw new Error('useGameLocale requires `gameId` in app.config.ts');
  }

  // The site-level app.config augmentation is not visible in every consuming
  // tsconfig, so read the field through an explicit shape.
  const locales = (appConfig as { locales?: string[] }).locales;
  const defaultLocale = locales?.[0] ?? 'en';
  const { config: globalConfig } = useGlobalConfig();
  const legacyCookie = useCookie<string>(`${appConfig.gameId}_locale`);

  return computed(() =>
    (globalConfig.value.gameLocales[appConfig.gameId as string] as string)
    ?? legacyCookie.value
    ?? defaultLocale,
  );
};
