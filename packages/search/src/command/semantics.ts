import type { CommandOption, CommandInputOption, LogicalCommandDescriptor, LogicalCommandOverride, LogicalWitness, Operator } from './types';

/** Builds the database-independent semantics used by planning and command resolution. */
export function describeLogicalCommand(
  option: CommandOption<string, CommandInputOption, any>,
  field: string,
  defaultWitness: LogicalWitness[],
  operator?: Operator,
): LogicalCommandDescriptor {
  const defaults = (() => {
    switch (option.type) {
    case 'builtin:text':
      return {
        valueClass:          'text',
        nullSemantics:       'empty-matches-null-or-empty',
        textSemantics:       'substring-exact-regex',
        collectionSemantics: 'not-applicable',
      } as const;
    case 'builtin:number':
      return {
        valueClass:          'number',
        nullSemantics:       'sql-unknown',
        textSemantics:       'not-applicable',
        collectionSemantics: 'not-applicable',
      } as const;
    case 'builtin:string':
      return {
        valueClass:          'string',
        nullSemantics:       'sql-unknown',
        textSemantics:       'exact',
        collectionSemantics: 'not-applicable',
      } as const;
    case 'builtin:simple':
      return {
        valueClass:          'string',
        nullSemantics:       'sql-unknown',
        textSemantics:       'exact',
        collectionSemantics: 'any-of',
      } as const;
    case 'builtin:simple-set':
      return {
        valueClass:          'set',
        nullSemantics:       'sql-unknown',
        textSemantics:       'not-applicable',
        collectionSemantics: 'contains-all-or-equals',
      } as const;
    case 'builtin:number-set':
      return {
        valueClass:          'number-set',
        nullSemantics:       'sql-unknown',
        textSemantics:       'not-applicable',
        collectionSemantics: 'any-element-comparison',
      } as const;
    case 'builtin:bit':
      return {
        valueClass:          'bitset',
        nullSemantics:       'sql-unknown',
        textSemantics:       'not-applicable',
        collectionSemantics: 'bitset-subset-or-count',
      } as const;
    case 'none':
      return {
        valueClass:          'raw',
        nullSemantics:       'handler-defined',
        textSemantics:       'handler-defined',
        collectionSemantics: 'handler-defined',
      } as const;
    default:
      return {
        valueClass:          'custom',
        nullSemantics:       'handler-defined',
        textSemantics:       'handler-defined',
        collectionSemantics: 'handler-defined',
      } as const;
    }
  })();

  const logical = option.logical as LogicalCommandOverride | undefined;
  const operatorSemantics = logical?.operatorSemantics;
  const operatorOverride = operator == null ? undefined : operatorSemantics?.[operator];
  const modifiers = option.input.modifiers == null
    ? []
    : Array.isArray(option.input.modifiers)
      ? [...option.input.modifiers]
      : Object.entries(option.input.modifiers).flatMap(([long, short]) => [long, short]);

  return {
    ...defaults,
    ...logical,
    ...operatorOverride,
    field:       logical?.field ?? field,
    witness:     operatorOverride?.witness ?? logical?.witness ?? defaultWitness,
    operators:   operator == null ? [...option.input.operators] : [operator],
    qualifiers:  [...option.input.qualifiers],
    modifiers,
    pattern:     option.input.pattern ?? null,
    allowsRegex: option.input.regex,
    expansion:   operatorOverride?.expansion ?? logical?.expansion ?? [],
    ...(operatorSemantics == null ? {} : { operatorSemantics }),
  };
}
