import { mainLocale } from '@tcg-cards/model/src/magic/schema/basic';

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'magic',
      neutral: 'slate',
    },
  },

  gameId: 'magic',

  appIcon: 'i:magic-logo',

  locales: mainLocale.options,
});
