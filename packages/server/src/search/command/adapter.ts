/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CommandInput, CommandInputOption } from '@search/command';
import { CommandBuilder, CommandOption } from '@search/index';
import { ServerCommandContext, ServerCommandHandler, ServerHandlerCtx, ServerKindReturnMap } from './builder';

import { MetaBase, MetaRest } from '@search/base/meta';
import { Merge, merge } from '@search/util/merge';

import { Column } from 'drizzle-orm';
import { ServerKind } from './types';

export type ServerAdapterHandlerInput<Kind extends ServerKind, Input extends CommandInputOption, MetaValue> =
    <Table>(
        args: CommandInput<Input>,
        ctx: ServerHandlerCtx<Table, MetaValue> & { column: Column },
    ) => ServerKindReturnMap[Kind];

export class ServerCommandAdapterCreator {
    adapt<
        Type extends string,
        Input extends CommandInputOption,
        MetaInput extends MetaBase,
        MetaValue extends MetaBase,
    >(command: CommandBuilder<Type, Input, MetaInput, MetaValue>) {
        return new ServerCommandAdapter<Type, Input, MetaInput, MetaValue>(command.options);
    }
}

export class ServerCommandAdapter<
    Type extends string,
    Input extends CommandInputOption,
    MetaInput extends MetaBase,
    MetaValue extends MetaBase,
> {
    options: CommandOption<Type, Input, MetaValue>;

    constructor(options: CommandOption<Type, Input, MetaValue>) {
        this.options = options;
    }

    $meta<M extends MetaBase>(): ServerCommandAdapter<Type, Input, Merge<MetaInput, M>, MetaValue>;
    $meta<M extends MetaBase>(meta: M): ServerCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>;

    $meta<M extends MetaBase>(meta?: M) {
        if (meta == null) {
            return new ServerCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, {}>>({
                ...this.options,
                meta: merge(this.options.meta, {}),
            });
        } else {
            return new ServerCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>({
                ...this.options,
                meta: merge(this.options.meta, meta),
            });
        }
    }

    handler(handler: ServerAdapterHandlerInput<'query', Input, MetaInput>) {
        return new ServerCommandAdapterHandler<Type, 'query', Input, MetaInput, MetaValue>({
            options: this.options,
            kind:    'query',
            handler,
        });
    }

    process<Kind extends ServerKind>(kind: Kind, handler: ServerAdapterHandlerInput<Kind, Input, MetaInput>) {
        return new ServerCommandAdapterHandler<Type, Kind, Input, MetaInput, MetaValue>({
            options: this.options,
            kind,
            handler,
        });
    }
}

export class ServerCommandAdapterHandler<
    Type extends string,
    Kind extends ServerKind,
    Input extends CommandInputOption,
    MetaInput extends MetaBase,
    MetaValue extends MetaBase,
> {
    options: CommandOption<Type, Input, MetaValue>;
    kind:    Kind;
    handler: ServerAdapterHandlerInput<Kind, Input, MetaInput>;

    constructor(
        options: {
            options: CommandOption<Type, Input, MetaValue>;
            kind:    Kind;
            handler: ServerAdapterHandlerInput<Kind, Input, MetaInput>;
        },
    ) {
        this.options = options.options;
        this.kind = options.kind;
        this.handler = options.handler;
    }

    apply<Table>(column: (table: Table) => Column, meta: MetaRest<MetaInput, MetaValue>): ServerCommandHandler<Kind, Input, MetaValue, Table> {
        return (args: CommandInput<Input>, ctx: ServerCommandContext<MetaValue, Table>) => {
            return this.handler(args,
                {
                    meta:   merge(ctx.meta, meta) as MetaInput,
                    column: column(ctx.table),
                    table:  ctx.table,
                } as any,
            );
        };
    }

    call<Table>(
        options: {
            column: (table: Table) => Column;
            args:   CommandInput<Input>;
            ctx:    ServerCommandContext<MetaRest<MetaInput, MetaValue>, Table>;
        },
    ): ServerKindReturnMap[Kind] {
        const { column, args, ctx } = options;

        return this.handler(args, {
            meta:   merge(this.options.meta, (ctx as any).meta ?? {}) as MetaInput,
            column: column(ctx.table),
            table:  ctx.table,
        } as any);
    }
}

export const ca = new ServerCommandAdapterCreator();
