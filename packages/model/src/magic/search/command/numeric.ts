import { all } from '#search/command/builtin/all';

export const numeric = all
  .$type('magic:numeric')
  .logical({
    valueClass:          'number',
    nullSemantics:       'sql-unknown',
    textSemantics:       'not-applicable',
    collectionSemantics: 'not-applicable',
  });
