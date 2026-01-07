/* eslint-disable @typescript-eslint/no-empty-object-type */
import { PatternContext } from '@search/base/pattern';
import { MetaBase } from '@search/base/meta';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
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

export type ModifierInput<Mod extends string[] | Record<string, string> | undefined> =
    Mod extends never
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

export type CommandInput<Input extends CommandInputOption> = {
    value:     Input['regex'] extends true ? (string | RegExp) : string;
    operator:  Input['operators'][0];
    qualifier: Input['qualifiers'];
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
