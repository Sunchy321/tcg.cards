/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { PatternContext } from '#search/base/pattern';
import type { MetaBase } from '#search/base/meta';

export type Operator = ':' | '~:' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type CommandInputOption = {
  operators:    Operator[];
  qualifiers:   Qualifier[];
  modifiers?:   string[] | Record<string, string>;
  pattern?:     string;
  alwaysMatch?: boolean;
  regex:        boolean;
};

export type ModifierType<Mod extends string[] | Record<string, string>> = Mod extends any[] ? Mod[number] : keyof Mod;

export type ModifierInput<Mod extends string[] | Record<string, string> | undefined>
  = Mod extends never
    ? { }
    : Mod extends string[] | Record<string, string>
      ? { modifier: ModifierType<Mod> }
      : { modifier?: never };

export type PatternContextLoose<Pat> = string extends Pat
  ? Record<string, string>
  : PatternContext<Pat>;

export type PatternInput<Pat extends string | undefined, Op extends Operator, AlwaysMatch extends boolean | undefined> = Pat extends undefined
  ? {}
  : AlwaysMatch extends true
    ? { pattern: PatternContextLoose<Pat> }
    : Op extends ''
      ? { pattern: PatternContextLoose<Pat> }
      : { pattern?: PatternContextLoose<Pat> };

/** How a query value was written in the search text: bare identifier, quoted string, or regular expression. */
export type CommandArgType = 'id' | 'string' | 'regex';

/** Classifies a command's parsed values without referring to a storage engine. */
export type LogicalValueClass = 'text' | 'number' | 'string' | 'set' | 'number-set' | 'bitset' | 'raw' | 'custom' | 'scope' | 'sort' | 'composite';

/** Describes how a command treats missing values. */
export type LogicalNullSemantics = 'sql-unknown' | 'empty-matches-null-or-empty' | 'handler-defined' | 'not-applicable';

/** Describes text matching behavior independently from SQL syntax. */
export type LogicalTextSemantics = 'substring-exact-regex' | 'exact' | 'handler-defined' | 'not-applicable';

/** Describes collection matching behavior independently from SQL syntax. */
export type LogicalCollectionSemantics = 'any-of' | 'contains-all-or-equals' | 'any-element-comparison' | 'bitset-subset-or-count' | 'handler-defined' | 'not-applicable';

/** Names the row identities that must remain shared while matching a query. */
export type LogicalWitness = 'same-record' | 'same-combination' | 'same-print' | 'same-card-entity';

/** Declares storage-independent command meaning in a game command definition. */
export type LogicalCommandDescriptor = {
  field:               string;
  valueClass:          LogicalValueClass;
  nullSemantics:       LogicalNullSemantics;
  textSemantics:       LogicalTextSemantics;
  collectionSemantics: LogicalCollectionSemantics;
  witness:             LogicalWitness[];
  operators:           Operator[];
  qualifiers:          Qualifier[];
  modifiers:           string[];
  pattern:             string | null;
  allowsRegex:         boolean;
  expansion:           string[];
  operatorSemantics?:  Partial<Record<Operator, LogicalOperatorOverride>>;
};

/** Overrides command meaning for one specific operator. */
export type LogicalOperatorOverride = Partial<Pick<LogicalCommandDescriptor,
  'valueClass' | 'nullSemantics' | 'textSemantics' | 'collectionSemantics' | 'witness' | 'expansion'>>;

/** Overrides inferred generic semantics for a game-specific command. */
export type LogicalCommandOverride = Partial<Omit<LogicalCommandDescriptor, 'field' | 'operators' | 'qualifiers' | 'modifiers' | 'pattern' | 'allowsRegex' | 'operatorSemantics'>> & {
  field?:             string;
  operatorSemantics?: Partial<Record<Operator, LogicalOperatorOverride>>;
};

export type CommandInput<Input extends CommandInputOption> = {
  value:     Input['regex'] extends true ? (string | RegExp) : string;
  operator:  Input['operators'][0];
  qualifier: Input['qualifiers'];
  argType?:  CommandArgType;
} & ModifierInput<Input['modifiers']> & PatternInput<Input['pattern'], Input['operators'][0], Input['alwaysMatch']>;

export type MetaDataType<MetaInput extends MetaBase, MetaValue extends MetaBase> = {
  [K in keyof MetaInput]: K extends keyof MetaValue ? MetaValue[K] : MetaInput[K];
};

export type CommandOption<Type extends string, Input extends CommandInputOption, MetaValue extends MetaBase> = {
  type?:         Type;
  id?:           string;
  alternatives?: string[];
  input:         Input;
  meta:          MetaValue;
  logical?:      LogicalCommandOverride;
};

type CommonCommandInputIntern = CommandInput<{
  operators:    Operator[];
  qualifiers:   Qualifier[];
  modifiers?:   string[] | Record<string, string>;
  pattern:      string;
  alwaysMatch?: boolean;
  regex:        true;
}>;

export type CommonCommandInput = {
  [K in keyof CommonCommandInputIntern]: CommonCommandInputIntern[K];
};
