import { toAmbit, type Ambit } from '@tcg-cards/base';

/** The ambit URL param parsed into its ladder level; null when the param is
 * absent or not a level. The search-DSL ambit commands never touch this param
 * — they only override the search semantics server-side. */
export const useAmbitParam = () => {
  const route = useRoute();

  return computed<Ambit | null>(() => {
    const raw = route.query.ambit;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value == null ? null : toAmbit(value);
  });
};
