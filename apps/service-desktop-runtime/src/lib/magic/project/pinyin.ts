import TraditionalDict from '@pinyin-pro/data/traditional';
import { addTraditionalDict, pinyin } from 'pinyin-pro';

addTraditionalDict(TraditionalDict);

/** Holds the search-only full-pinyin and initials forms of a localized card name. */
export type MagicNamePinyin = {
  full:     string;
  initials: string;
};

/** Derives lowercase, tone-free, unseparated pinyin using the locale's dictionary. */
export function deriveMagicNamePinyin(name: string, locale: 'zhs' | 'zht'): MagicNamePinyin {
  const options = {
    toneType:    'none',
    type:        'array',
    nonZh:       'consecutive',
    traditional: locale === 'zht',
  } as const;

  return {
    full:     pinyin(name, options).join('').toLowerCase(),
    initials: pinyin(name, { ...options, pattern: 'first' }).join('').toLowerCase(),
  };
}
