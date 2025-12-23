export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type MetaBase = Record<string, any>;

export interface CommandBuilderOption<
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

type HiddenMap<T> = {
    [K in keyof T]?: boolean;
};

type Hidden<T, Called extends HiddenMap<T>> = Omit<T, {
    [K in keyof Called]: Called[K] extends true ? K : never
}[keyof Called]>;

export class CommandBuilder<
    Called extends HiddenMap<CommandBuilder<any, any, any, any, any, any, any>>,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    AllowRegex extends boolean,
> {
    options: CommandBuilderOption<Op, Qual, Mod, Meta, Pat, AllowRegex>;

    constructor(options: CommandBuilderOption<Op, Qual, Mod, Meta, Pat, AllowRegex>) {
        this.options = options;
    }

    use<U>(predefined: U): CommandBuilder<Called & { use: true }, Op, Qual, Mod, Meta, Pat, AllowRegex> & U {
        return Object.assign(
            new CommandBuilder<Called & { use: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>({
                ...this.options,
            }),
            predefined,
        );
    }

    $meta<M extends MetaBase>(meta: M): Hidden<CommandBuilder<Called & { $meta: true }, Op, Qual, Mod, M, Pat, AllowRegex>, Called & { $meta: true }> {
        return new CommandBuilder<Called & { $meta: true }, Op, Qual, Mod, M, Pat, AllowRegex>({
            ...this.options,
            meta,
        });
    }

    meta(meta: Meta): Hidden<CommandBuilder<Called & { meta: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>, Called & { meta: true }> {
        return new CommandBuilder<Called & { meta: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            meta,
        });
    }

    id(id: string): Hidden<CommandBuilder<Called & { id: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>, Called & { id: true }> {
        return new CommandBuilder<Called & { id: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            id,
        });
    }

    alt(alt: string | string[]): Hidden<CommandBuilder<Called & { alt: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>, Called & { alt: true }> {
        return new CommandBuilder<Called & { alt: true }, Op, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            alternatives: Array.isArray(alt) ? alt : [alt],
        });
    }

    op<NewOp extends Operator>(operators: NewOp[]): Hidden<CommandBuilder<Called & { op: true }, NewOp, Qual, Mod, Meta, Pat, AllowRegex>, Called & { op: true }> {
        return new CommandBuilder<Called & { op: true }, NewOp, Qual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            operators,
        });
    }

    qual<NewQual extends Qualifier>(qualifiers: NewQual[]): Hidden<CommandBuilder<Called & { qual: true }, Op, NewQual, Mod, Meta, Pat, AllowRegex>, Called & { qual: true }> {
        return new CommandBuilder<Called & { qual: true }, Op, NewQual, Mod, Meta, Pat, AllowRegex>({
            ...this.options,
            qualifiers,
        });
    }

    mod<NewMod extends any[] | object>(modifiers: NewMod): Hidden<
        CommandBuilder<
            Called & { mod: true },
            Op,
            Qual,
            (NewMod extends (infer M)[] ? M : keyof NewMod),
            Meta,
            Pat,
            AllowRegex
        >, Called & { mod: true }> {
        const mods = (
            Array.isArray(modifiers) ? modifiers : Object.keys(modifiers)
        ) as (NewMod extends (infer M)[] ? M : keyof NewMod);

        return new CommandBuilder<
            Called & { mod: true },
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

    pattern<P extends string>(pattern: P): Hidden<CommandBuilder<Called & { pattern: true }, Op | '', Qual, Mod, Meta, P, AllowRegex>, Called & { pattern: true }> {
        return new CommandBuilder<Called & { pattern: true }, Op | '', Qual, Mod, Meta, P, AllowRegex>({
            ...this.options,
            pattern,
            operators: (this.options.operators as string[]).includes('')
                ? this.options.operators
                : [...this.options.operators, ''],
        });
    }

    regex<B extends boolean>(allow: B): Hidden<CommandBuilder<Called & { regex: true }, Op, Qual, Mod, Meta, Pat, B>, Called & { regex: true }> {
        return new CommandBuilder<Called & { regex: true }, Op, Qual, Mod, Meta, Pat, B>({
            ...this.options,
            regex: allow,
        });
    }

    done(): CommandBuilderOption<Op, Qual, Mod, Meta, Pat, AllowRegex> {
        return this.options;
    }
}

export const c = new CommandBuilder<
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {},
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
