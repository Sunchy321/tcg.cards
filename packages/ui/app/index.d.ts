import type { ActionDef } from '~/composables/action';

declare module 'nuxt/schema' {
  interface AppConfigInput {
    appIcon?:       string;
    /** Game identifier for game-specific features such as roles and permissions. */
    gameId?:        string;
    /** Available locales for the site-level locale switcher in the header. */
    locales?:       string[];
    /** Default game data locale when no cookie has been stored yet. */
    defaultLocale?: string;
  }

  interface AppConfig {
    appIcon?:       string;
    gameId?:        string;
    locales?:       string[];
    defaultLocale?: string;
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
