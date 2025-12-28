import { Hide, HiddenKeys } from '@search/util/hide';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type MetaBase = Record<string, any>;

export interface CommandOption<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
> {
    type?:         Type;
    id?:           string;
    alternatives?: string[];
    operators:     Op[];
    qualifiers:    Qual[];
    modifiers:     Mod[];
    pattern?:      Pat;
    alwaysMatch?:  PatAlwaysMatch;
    meta?:         Meta;
    regex:         AllowRegex;
}

export class CommandBuilder<
    Called extends HiddenKeys<CommandBuilder<any, any, any, any, any, any, any, any, any>>,
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
> {
    options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>;

    constructor(options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>) {
        this.options = options;
    }

    use<U>(predefined: U): CommandBuilder<Called | 'use', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex> & U {
        return Object.assign(
            new CommandBuilder<Called | 'use', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
                ...this.options,
            }),
            predefined,
        );
    }

    $meta<M extends MetaBase>(): Hide<CommandBuilder<Called | '$meta', Type, Op, Qual, Mod, M, Pat, PatAlwaysMatch, AllowRegex>, Called | '$meta'>;
    $meta<M extends MetaBase>(meta: M): Hide<CommandBuilder<Called | '$meta', Type, Op, Qual, Mod, Partial<M>, Pat, PatAlwaysMatch, AllowRegex>, Called | '$meta'>;

    $meta<M extends MetaBase>(meta?: M) {
        if (meta == null) {
            return new CommandBuilder<Called | '$meta', Type, Op, Qual, Mod, M, Pat, PatAlwaysMatch, AllowRegex>({
                ...this.options,
                meta: undefined,
            });
        } else {
            return new CommandBuilder<Called | '$meta', Type, Op, Qual, Mod, Partial<M>, Pat, PatAlwaysMatch, AllowRegex>({
                ...this.options,
                meta: meta,
            });
        }
    }

    $type<NewType extends string>(type: NewType): Hide<CommandBuilder<Called | '$type', NewType, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | '$type'> {
        return new CommandBuilder<Called | '$type', NewType, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            type,
        });
    }

    meta(meta: Meta): Hide<CommandBuilder<Called | 'meta', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | 'meta'> {
        return new CommandBuilder<Called | 'meta', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            meta,
        });
    }

    id(id: string): Hide<CommandBuilder<Called | 'id', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | 'id'> {
        return new CommandBuilder<Called | 'id', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            id,
        });
    }

    alt(alt: string | string[]): Hide<CommandBuilder<Called | 'alt', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | 'alt'> {
        return new CommandBuilder<Called | 'alt', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            alternatives: Array.isArray(alt) ? alt : [alt],
        });
    }

    op<NewOp extends Operator>(operators: NewOp[]): Hide<CommandBuilder<Called | 'op', Type, NewOp, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | 'op'> {
        return new CommandBuilder<Called | 'op', Type, NewOp, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            operators,
        });
    }

    qual<NewQual extends Qualifier>(qualifiers: NewQual[]): Hide<CommandBuilder<Called | 'qual', Type, Op, NewQual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called | 'qual'> {
        return new CommandBuilder<Called | 'qual', Type, Op, NewQual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>({
            ...this.options,
            qualifiers,
        });
    }

    mod<NewMod extends any[] | object>(modifiers: NewMod): Hide<
        CommandBuilder<
            Called | 'mod',
            Type,
            Op,
            Qual,
            (NewMod extends (infer M)[] ? M : keyof NewMod),
            Meta,
            Pat,
            PatAlwaysMatch,
            AllowRegex
        >, Called | 'mod'> {
        const mods = (
            Array.isArray(modifiers) ? modifiers : Object.keys(modifiers)
        ) as (NewMod extends (infer M)[] ? M : keyof NewMod);

        return new CommandBuilder<
            Called | 'mod',
            Type,
            Op,
            Qual,
            (NewMod extends (infer M)[] ? M : keyof NewMod),
            Meta,
            Pat,
            PatAlwaysMatch,
            AllowRegex
        >({
                    ...this.options,
                    modifiers: mods,
                });
    }

    pattern<P extends string, AM extends boolean = false>(
        pattern: P,
        alwaysMatch?: AM,
    ): Hide<CommandBuilder<Called | 'pattern', Type, Op | '', Qual, Mod, Meta, P, AM extends undefined ? false : AM, AllowRegex>, Called | 'pattern'> {
        return new CommandBuilder<Called | 'pattern', Type, Op | '', Qual, Mod, Meta, P, AM extends undefined ? false : AM, AllowRegex>({
            ...this.options,
            pattern,
            operators: (this.options.operators as string[]).includes('')
                ? this.options.operators
                : [...this.options.operators, ''] as Op[],
            alwaysMatch: (alwaysMatch ?? false) as AM extends undefined ? false : AM,
        });
    }

    regex<B extends boolean>(allow: B): Hide<CommandBuilder<Called | 'regex', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, B>, Called | 'regex'> {
        return new CommandBuilder<Called | 'regex', Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, B>({
            ...this.options,
            regex: allow,
        });
    }

    done(): CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex> {
        return this.options;
    }
}

export const c = new CommandBuilder<
    never,
    never,
    never,
    never,
    never,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {},
    never,
    never,
    false
>({
    operators:  [],
    qualifiers: [],
    modifiers:  [],
    meta:       {},
    regex:      false,
});
