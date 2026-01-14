/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CommandMapBase, CommandOption, ModelOptions } from '@search/index';
import { CommandInput, CommandInputOption } from '@search/command';
import { ServerCommandAdapterHandler } from './adapter';
import { ServerCommandBuilderOption, ServerCommand, ServerKind } from './types';

import { MetaBase, MetaRest } from '@search/base/meta';
import { Hide, HiddenKeys } from '@search/util/hide';

import { Column, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type AdapterBase = ServerCommandAdapterHandler<any, any, any, any, any>;
export type AdapterMapBase = Record<string, any>;

export type SelectAdapter<
    Adapters extends AdapterMapBase,
    Type extends string,
> = {
    [K in keyof Adapters]: Adapters[K] extends ServerCommandAdapterHandler<infer T, infer _K, infer _I, infer _MI, infer _MV>
        ? Type extends T
            ? Adapters[K]
            : never
        : never;
}[keyof Adapters];

export type AdapterKind<Adapter extends AdapterBase> = Adapter extends ServerCommandAdapterHandler<infer _T, infer K, infer _I, infer _MI, infer _MV>
    ? K
    : never;

export type AdapterMeta<Adapter extends AdapterBase> = Adapter extends ServerCommandAdapterHandler<infer _T, infer _K, infer _I, infer MI, infer MV>
    ? MetaRest<MI, MV>
    : never;

export type ServerCommandMaps<CommandMap extends CommandMapBase, Table, Adapters extends AdapterMapBase> = {
    [K in keyof CommandMap]: CommandMap[K] extends CommandOption<infer Type, infer Input, infer MetaValue>
        ? SelectAdapter<Adapters, Type> extends never
            ? ServerCommandBuilder<Type, Input, MetaValue, Table>
            : ServerCommandBuilderWithAdapter<Type, Input, MetaValue, Table, SelectAdapter<Adapters, Type>>
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

                        new ServerCommandBuilder<any, any, any, Table>({
                            options: option,
                        }),
                    ];
                } else {
                    return [
                        key,

                        new ServerCommandBuilderWithAdapter<any, any, any, Table, any>({
                            options: option,
                        }, adapter),
                    ];
                }
            }),
        ) as any;
    }
}

export type ServerHandlerMeta<MetaValue> = MetaValue extends never ? {} : { meta: MetaValue };

export type ServerHandlerCtx<Table, MetaValue> = {
    table: Table;
} & ServerHandlerMeta<MetaValue>;

export type ServerCommandContext<
    MetaValue extends MetaBase,
    Table,
> = MetaValue extends never ? {
    table: Table;
} : {
    meta:  MetaValue;
    table: Table;
};

export type ServerKindReturnMap = {
    'query':    SQL;
    'order-by': (PgColumn | SQL | SQL.Aliased)[];
};

export type ServerCommandHandler<
    Kind extends ServerKind,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> = (
    args: CommandInput<Input>,
    ctx: ServerCommandContext<MetaValue, Table>,
) => ServerKindReturnMap[Kind];

export class ServerCommandBuilder<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> {
    options: ServerCommandBuilderOption<Type, Input, MetaValue, Table>;

    constructor(options: ServerCommandBuilderOption<Type, Input, MetaValue, Table>) {
        this.options = options;
    }

    handler(handler: ServerCommandHandler<'query', Input, MetaValue, Table>): ServerCommand<Type, 'query', Input, MetaValue, Table> {
        return new ServerCommand<Type, 'query', Input, MetaValue, Table>({
            ...this.options,
            kind: 'query',
            handler,
        });
    }

    action<K extends ServerKind>(kind: K, handler: ServerCommandHandler<K, Input, MetaValue, Table>): ServerCommand<Type, K, Input, MetaValue, Table> {
        return new ServerCommand<Type, K, Input, MetaValue, Table>({
            ...this.options,
            kind,
            handler,
        });
    }
}

export class ServerCommandBuilderWithAdapter<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
    Adapter extends AdapterBase,
> extends ServerCommandBuilder<Type, Input, MetaValue, Table> {
    adapter: Adapter;

    constructor(
        options: ServerCommandBuilderOption<Type, Input, MetaValue, Table>,
        adapter: Adapter,
    ) {
        super(options);
        this.adapter = adapter;
    }

    apply(column: (table: Table) => Column, meta: AdapterMeta<Adapter>): ServerCommand<Type, AdapterKind<Adapter>, Input, MetaValue, Table> {
        const handler = this.adapter.apply(column, meta);

        return new ServerCommand<Type, AdapterKind<Adapter>, Input, MetaValue, Table>({
            options: this.options.options,
            kind:    this.adapter.kind,
            handler,
        });
    }
}

export const cs = new ServerCommandBase<never, {}, never, {}>({
    commands: {},
    tables:   [],
    adapters: {},
});
