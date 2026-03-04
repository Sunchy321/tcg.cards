import type { ActionDef } from '~/composables/action';

declare module '#app' {
  interface PageMeta {
    actions?:   ActionDef[];
    titleType?: 'text' | 'input';
    title?:     string;
  }
}

export {};
