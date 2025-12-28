import { Hide, HiddenKeys } from '@search/util/hide';

import { PatternContext } from '@search/base/pattern';
import { CommandMapBase, CommandOption, ModelOptions } from '@search/index';
import { ServerCommandAdapterHandler } from './adapter';

import { OmitNever } from '../util';

import { Column, SQL, sql } from 'drizzle-orm';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type MetaBase = Record<string, any>;

export type AdapterBase = ServerCommandAdapterHandler<any, any, any, any, any, any, any, any, any>;
export type AdapterMapBase = Record<string, any>;

export type SelectAdapter<
    Adapters extends AdapterMapBase,
    Type extends string,
> = {
    [K in keyof Adapters]: Adapters[K] extends ServerCommandAdapterHandler<infer T, infer _1, infer _2, infer _3, infer _4, infer _5, infer _6, infer _7, infer _8>
        ? Type extends T
            ? Adapters[K]
            : never
        : never;
}[keyof Adapters];

export type AdapterMeta<Adapter extends AdapterBase> = Adapter extends ServerCommandAdapterHandler<infer _1, infer _2, infer _3, infer _4, infer _5, infer _6, infer _7, infer _8, infer Meta>
    ? Meta
    : never;

export type ServerCommandMaps<CommandMap extends CommandMapBase, Table, Adapters extends AdapterMapBase> = {
    [K in keyof CommandMap]: CommandMap[K] extends CommandOption<
        infer Type,
        infer Op,
        infer Qual,
        infer Mod,
        infer Meta,
        infer Pat,
        infer PatAlwaysMatch,
        infer AllowRegex
    >
        ? SelectAdapter<Adapters, Type> extends never
            ? ServerCommandBuilder<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>
            : ServerCommandBuilderWithAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table, SelectAdapter<Adapters, Type>>
        : never;
};

export interface ServerCommandBaseOption<
    CommandMap extends CommandMapBase,
    Table,
    Adapters extends AdapterMapBase,
> {
    commands: CommandMap;
    tables:   Table[];
    adapters: Adapters;
}

export class ServerCommandBase<
    Called extends HiddenKeys<ServerCommandBase<any, any, any, any>>,
    Command extends CommandMapBase,
    Table,
    Adapters extends AdapterMapBase,
> {
    options: ServerCommandBaseOption<Command, Table, Adapters>;

    constructor(options: ServerCommandBaseOption<Command, Table, Adapters>) {
        this.options = options;
    }

    with<C extends CommandMapBase>(model: ModelOptions<C>): Hide<ServerCommandBase<Called | 'with', C, Table, Adapters>, Called | 'with'> {
        return new ServerCommandBase<Called | 'with', C, Table, Adapters>({
            ...this.options,
            commands: model.commands,
        });
    }

    table<T>(tables: T[]): Hide<ServerCommandBase<Called | 'table', Command, T, Adapters>, Called | 'table'> {
        return new ServerCommandBase<Called | 'table', Command, T, Adapters>({
            ...this.options,
            tables,
        });
    }

    use<A extends AdapterMapBase>(adapters: A): Hide<ServerCommandBase<Called | 'use', Command, Table, A>, Called | 'use'> {
        return new ServerCommandBase<Called | 'use', Command, Table, A>({
            ...this.options,
            adapters,
        });
    }

    get commands(): ServerCommandMaps<Command, Table, Adapters> {
        return Object.fromEntries(
            Object.entries(this.options.commands).map(([key, option]) => {
                const adapter = Object.values(this.options.adapters).find(a => a.options.type === option.type);

                if (adapter == null) {
                    return [
                        key,

                        new ServerCommandBuilder<any, any, any, any, any, any, any, any, Table>({
                            options: option,
                            handler: () => sql``,
                        }),
                    ];
                } else {
                    return [
                        key,

                        new ServerCommandBuilderWithAdapter<any, any, any, any, any, any, any, any, Table, any>({
                            options: option,
                            handler: () => sql``,
                        }, adapter),
                    ];
                }
            }),
        ) as any;
    }
}

export type ServerCommandHandlerArgs<
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
> = OmitNever<{
    operator:  Op;
    qualifier: Qual[];
    modifier:  Mod;
    value:     AllowRegex extends true ? string | RegExp : string;
    pattern:  PatAlwaysMatch extends true
        ? PatternContext<Pat>
        : Op extends ''
            ? PatternContext<Pat>
            : PatternContext<Pat> | undefined;
}>;

export type ServerCommandContext<
    Meta extends MetaBase,
    Table,
> = Meta extends never ? {
    table: Table;
} : {
    meta:  Meta;
    table: Table;
};

export type ServerCommandHandler<
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    Table,
> = (
    args: ServerCommandHandlerArgs<Op, Qual, Mod, Pat, PatAlwaysMatch, AllowRegex>,
    ctx: ServerCommandContext<Meta, Table>,
) => SQL;

export interface ServerCommandOption<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    Table,
> {
    options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>;
    handler: ServerCommandHandler<Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>;
}

export class ServerCommandBuilder<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    Table,
> {
    options: ServerCommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>;

    constructor(options: ServerCommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>) {
        this.options = options;
    }

    handler(handler: ServerCommandHandler<Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>): ServerCommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table> {
        return {
            ...this.options,
            handler,
        };
    }
}

export class ServerCommandBuilderWithAdapter<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    Table,
    Adapter extends AdapterBase,
> extends ServerCommandBuilder<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table> {
    adapter: Adapter;

    constructor(
        options: ServerCommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table>,
        adapter: Adapter,
    ) {
        super(options);
        this.adapter = adapter;
    }

    apply(column: (table: Table) => Column, meta: AdapterMeta<Adapter>): ServerCommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table> {
        const handler = this.adapter.apply(column, meta);

        return {
            options: this.options.options,
            handler,
        };
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const cs = new ServerCommandBase<never, {}, never, {}>({
    commands: {},
    tables:   [],
    adapters: {},
});
