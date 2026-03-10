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
    titleType?: 'text' | 'input';
    title?:     string;
    params?:    { id: string, type: 'select' | 'switch', icon?: string }[];
    actions?:   ActionDef[];
  }
}

export {};
