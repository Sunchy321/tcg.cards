import { all } from '#search/command/builtin/all';

export const cost = all
  .$type('magic:cost')
  .$meta({ allowFloat: false })
  .logical({
    valueClass:          'custom',
    nullSemantics:       'sql-unknown',
    textSemantics:       'not-applicable',
    collectionSemantics: 'not-applicable',
  });
