import { ca } from '../adapter';

import { simple as simpleSchema } from '#search/command/builtin/simple';

import { defaultTranslate } from '#search/client/translate';

export type SimpleClientOption = {
  map?: Record<string, string> | boolean | ((value: string) => string);
};

export type SimpleMeta = {
  id:         string;
  mapValue?:  Record<string, string> | boolean | ((value: string) => string);
  valueText?: (value: string) => string;
};

const operatorMap: Record<string, string> = {
  '=':  'is',
  '!=': 'is-not',
  ':':  'is',
  '!:': 'is-not',
};

export const simple = ca
  .adapt(simpleSchema)
  .$meta<SimpleMeta>()
  .explain((arg, { id, mapValue, valueText }, i18n) => {
    const realValue = (() => {
      const { value } = arg;

      if (valueText != null) {
        return valueText(value);
      }

      // NO changes
      if (mapValue == null || mapValue === false) {
        return value;
      }

      if (typeof value !== 'string') {
        return value;
      }

      const valueKey = mapValue === true
        ? value
        : mapValue instanceof Function
          ? mapValue(value)
          : mapValue[value] ?? value;

      return i18n(`$.parameter.${id}.${valueKey}`);
    })();

    return defaultTranslate({ ...arg, value: realValue }, i18n, id, operatorMap);
  });
