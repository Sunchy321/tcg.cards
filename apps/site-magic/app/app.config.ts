import { mainLocale } from '#model/magic/schema/basic';

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate',
    },
  },

  gameId: 'magic',

  appIcon: 'i:magic-logo',

  locales: mainLocale.options,
});
