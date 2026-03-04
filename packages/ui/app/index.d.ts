import type { ActionDef } from '~/composables/actions';

declare module '#app' {
  interface PageMeta {
    actions?:   ActionDef[];
    titleType?: 'text' | 'input';
    title?:     string;
  }
}

export {};
