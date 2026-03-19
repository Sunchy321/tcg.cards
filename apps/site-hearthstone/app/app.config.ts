import { mainLocale } from '#model/hearthstone/schema/basic';

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'hearthstone',
      neutral: 'slate',
    },
  },

  gameId: 'hearthstone',

  appIcon: 'i:hearthstone-logo',

  locales: mainLocale.options,
});
