import type { ActionDef } from '~/composables/action';

declare module 'nuxt/schema' {
  interface AppConfigInput {
    appIcon?: string;
  }

  interface AppConfig {
    appIcon?: string;
  }
}

declare module '#app' {
  interface PageMeta {
    actions?:   ActionDef[];
    titleType?: 'text' | 'input';
    title?:     string;
  }
}

export {};
