/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CommandMapBase, CommandOption, ModelOptions } from '@search/index';
import { CommandInput, CommandInputOption } from '@search/command';
import { ServerCommandAdapterHandler } from './adapter';
import { ServerCommandOption } from './types';

import { MetaBase, MetaRest } from '@search/base/meta';
import { Hide, HiddenKeys } from '@search/util/hide';

import { Column, SQL, sql } from 'drizzle-orm';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type AdapterBase = ServerCommandAdapterHandler<any, any, any, any>;
export type AdapterMapBase = Record<string, any>;

export type SelectAdapter<
    Adapters extends AdapterMapBase,
    Type extends string,
> = {
    [K in keyof Adapters]: Adapters[K] extends ServerCommandAdapterHandler<infer T, infer _I, infer _MI, infer _MV>
        ? Type extends T
            ? Adapters[K]
            : never
        : never;
}[keyof Adapters];

export type AdapterMeta<Adapter extends AdapterBase> = Adapter extends ServerCommandAdapterHandler<infer _T, infer _I, infer MI, infer MV>
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
                            handler: () => sql``,
                        }),
                    ];
                } else {
                    return [
                        key,

                        new ServerCommandBuilderWithAdapter<any, any, any, Table, any>({
                            options: option,
                            handler: () => sql``,
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

export type ServerCommandHandler<
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> = (
    args: CommandInput<Input>,
    ctx: ServerCommandContext<MetaValue, Table>,
) => SQL;

export class ServerCommandBuilder<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> {
    options: ServerCommandOption<Type, Input, MetaValue, Table>;

    constructor(options: ServerCommandOption<Type, Input, MetaValue, Table>) {
        this.options = options;
    }

    handler(handler: ServerCommandHandler<Input, MetaValue, Table>): ServerCommandOption<Type, Input, MetaValue, Table> {
        return {
            ...this.options,
            handler,
        };
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
        options: ServerCommandOption<Type, Input, MetaValue, Table>,
        adapter: Adapter,
    ) {
        super(options);
        this.adapter = adapter;
    }

    apply(column: (table: Table) => Column, meta: AdapterMeta<Adapter>): ServerCommandOption<Type, Input, MetaValue, Table> {
        const handler = this.adapter.apply(column, meta);

        return {
            options: this.options.options,
            handler,
        };
    }
}

export const cs = new ServerCommandBase<never, {}, never, {}>({
    commands: {},
    tables:   [],
    adapters: {},
});
