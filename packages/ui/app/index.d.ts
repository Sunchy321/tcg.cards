import type { ActionDef } from '~/composables/action';

declare module 'nuxt/schema' {
  interface AppConfigInput {
    appIcon?: string;
    /** Game identifier, used to derive the locale cookie key as `{gameId}_locale`. */
    gameId:   string;
    /** Available locales for the site-level locale switcher in the header. */
    locales?: string[];
  }

  interface AppConfig {
    appIcon?: string;
    gameId:   string;
    locales?: string[];
  }
}

declare module '#app' {
  interface PageMeta {
    titleType?: 'text' | 'input';
    title?:     string;
    params?:    { id: string, type: 'select' | 'switch', icon?: string }[];
    actions?:   ActionDef[];
  }
}

export {};
