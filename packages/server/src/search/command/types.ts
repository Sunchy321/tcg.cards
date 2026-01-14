import { MetaBase } from '@search/base/meta';
import { CommandInput, CommandInputOption, CommandOption } from '@search/command';

import { ServerCommandContext, ServerCommandHandler, ServerKindReturnMap } from './builder';

import { PgColumn } from 'drizzle-orm/pg-core';
import { SQL } from 'drizzle-orm';

export type ServerKind = 'query' | 'order-by';

export type PostAction = {
    phase:  'order-by';
    action: (PgColumn | SQL | SQL.Aliased)[];
};

export interface ServerCommandBuilderOption<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    _Table,
> {
    options: CommandOption<Type, Input, MetaValue>;
}

export class ServerCommand<
    Type extends string,
    Kind extends ServerKind,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> implements ServerCommandBuilderOption<Type, Input, MetaValue, Table> {
    options: CommandOption<Type, Input, MetaValue>;
    kind:    Kind;
    handler: ServerCommandHandler<Kind, Input, MetaValue, Table>;

    constructor(options: {
        options: CommandOption<Type, Input, MetaValue>;
        kind:    Kind;
        handler: ServerCommandHandler<Kind, Input, MetaValue, Table>;
    }) {
        this.options = options.options;
        this.kind = options.kind;
        this.handler = options.handler;
    }

    is<K extends ServerKind>(kind: K): this is ServerCommand<Type, K, Input, MetaValue, Table> {
        return (this.kind satisfies ServerKind) === (kind satisfies ServerKind);
    }

    call(
        args: CommandInput<Input>,
        ctx: ServerCommandContext<MetaValue, Table>,
    ): ServerKindReturnMap[Kind] {
        return this.handler(args, ctx);
    }
}

export type CommonServerCommand = ServerCommand<
    string,
    ServerKind,
    CommandInputOption,
    MetaBase,
    any
>;
