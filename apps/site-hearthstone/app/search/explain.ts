import type { Locale } from '#model/hearthstone/schema/basic';
import type { I18N } from '#search/client/command';

import { resolveHearthstoneRawCardTerm } from '../../shared/search/localized-card-terms';

/** Translates one search explanation key with its optional named values. */
type ExplainTranslate = (key: string, named?: Record<string, any>) => string;

/** Adds the matched card property when a bare raw term is a localized game term. */
export function createSearchExplainI18n(
  translate: ExplainTranslate,
  getSearchLang: () => Locale,
): I18N {
  return (key, named) => {
    if (key !== '$.full-command.raw') {
      return translate(key, named);
    }

    if (named?.argType === 'id' && typeof named.value === 'string') {
      const cardTerm = resolveHearthstoneRawCardTerm(named.value, getSearchLang());
      if (cardTerm != null) {
        const property = translate(`$.full-command.raw-property-${cardTerm}`);
        return translate('$.full-command.raw-with-property', { value: named.value, property });
      }
    }

    return translate(key, { value: named?.value });
  };
}
