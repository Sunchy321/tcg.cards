import { Hide, HiddenKeys } from '@search/util/hide';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type MetaBase = Record<string, any>;

export interface CommandOption<
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    AllowRegex extends boolean,
> {
    id?:           string;
    alternatives?: string[];
    pattern?:      Pat;
    operators:     Op[];
    qualifiers:    Qual[];
    modifiers:     Mod[];
    meta:          Meta;
    regex:         AllowRegex;
}

export class CommandBuilder<
    Called extends HiddenKeys<CommandBuilder<any, any, any, any, any, any, any>>,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    AllowRegex extends boolean,
> {
    options: CommandOption<Op, Qual, Mod, Meta, Pat, AllowRegex>;

    constructor(options: CommandOption<Op, Qual, Mod, Meta, Pat, AllowRegex>) {
        this.options = options;
    }

    use<U>(predefined: U): CommandBuilder<Called | 'use', Op, Qual, Mod, Meta, Pat, AllowRegex> & U {
        return Object.assign(
            new CommandBuilder<Called | 'use', Op, Qual, Mod, Meta, Pat, AllowRegex>({
                ...this.options,
            }),
            predefined,
        );
    }

    $meta<M extends MetaBase>(meta: M): Hide<CommandBuilder<Called | '$meta', Op, Qual, Mod, M, Pat, AllowRegex>, Called | '$meta'> {
        return new CommandBuilder<Called | '$meta', Op, Qual, Mod, M, Pat, AllowRegex>({
            ...this.options,
            meta,
        });
    }

    meta(meta: Meta): Hide<CommandBuilder<Called | 'meta', Op, Qual, Mod, Meta, Pat, AllowRegex>, Called | 'meta'> {
        return new CommandBuilder<Called | 'meta', Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            meta,
        });
    }

    id(id: string): Hide<CommandBuilder<Called | 'id', Op, Qual, Mod, Meta, Pat, AllowRegex>, Called | 'id'> {
        return new CommandBuilder<Called | 'id', Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            id,
        });
    }

    alt(alt: string | string[]): Hide<CommandBuilder<Called | 'alt', Op, Qual, Mod, Meta, Pat, AllowRegex>, Called | 'alt'> {
        return new CommandBuilder<Called | 'alt', Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            alternatives: Array.isArray(alt) ? alt : [alt],
        });
    }

    op<NewOp extends Operator>(operators: NewOp[]): Hide<CommandBuilder<Called | 'op', NewOp, Qual, Mod, Meta, Pat, AllowRegex>, Called | 'op'> {
        return new CommandBuilder<Called | 'op', NewOp, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            operators,
        });
    }

    qual<NewQual extends Qualifier>(qualifiers: NewQual[]): Hide<CommandBuilder<Called | 'qual', Op, NewQual, Mod, Meta, Pat, AllowRegex>, Called | 'qual'> {
        return new CommandBuilder<Called | 'qual', Op, NewQual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            qualifiers,
        });
    }

    mod<NewMod extends any[] | object>(modifiers: NewMod): Hide<
        CommandBuilder<
            Called | 'mod',
            Op,
            Qual,
            (NewMod extends (infer M)[] ? M : keyof NewMod),
            Meta,
            Pat,
            AllowRegex
        >, Called | 'mod'> {
        const mods = (
            Array.isArray(modifiers) ? modifiers : Object.keys(modifiers)
        ) as (NewMod extends (infer M)[] ? M : keyof NewMod);

        return new CommandBuilder<
            Called | 'mod',
            Op,
            Qual,
            (NewMod extends (infer M)[] ? M : keyof NewMod),
            Meta,
            Pat,
            AllowRegex
        >({
                    ...this.options,
                    modifiers: mods,
                });
    }

    pattern<P extends string>(pattern: P): Hide<CommandBuilder<Called | 'pattern', Op | '', Qual, Mod, Meta, P, AllowRegex>, Called | 'pattern'> {
        return new CommandBuilder<Called | 'pattern', Op | '', Qual, Mod, Meta, P, AllowRegex>({
            ...this.options,
            pattern,
            operators: (this.options.operators as string[]).includes('')
                ? this.options.operators
                : [...this.options.operators, ''],
        });
    }

    regex<B extends boolean>(allow: B): Hide<CommandBuilder<Called | 'regex', Op, Qual, Mod, Meta, Pat, B>, Called | 'regex'> {
        return new CommandBuilder<Called | 'regex', Op, Qual, Mod, Meta, Pat, B>({
            ...this.options,
            regex: allow,
        });
    }

    done(): CommandOption<Op, Qual, Mod, Meta, Pat, AllowRegex> {
        return this.options;
    }
}

export const c = new CommandBuilder<
    never,
    never,
    never,
    never,
    Record<string, never>,
    never,
    false
>({
    operators:  [],
    qualifiers: [],
    modifiers:  [],
    meta:       {},
    regex:      false,
});
