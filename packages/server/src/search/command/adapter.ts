import { CommandBuilder, CommandOption, MetaBase, Operator, Qualifier } from '@search/index';
import { ServerCommandContext, ServerCommandHandler, ServerCommandHandlerArgs } from './builder';

import { HiddenKeys, Hide } from '@search/util/hide';
import { OmitNever } from '../util';

import { Column, SQL } from 'drizzle-orm';

export type ServerAdapterHandlerInput<
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
> = <Table>(
    args: ServerCommandHandlerArgs<Op, Qual, Mod, Pat, PatAlwaysMatch, AllowRegex>,
    ctx: OmitNever<{
        meta: Meta;
    }> & {
        column: Column;
        table:  Table;
    }
) => SQL;

export class ServerCommandAdapterCreator {
    adapt<
        Called extends HiddenKeys<CommandBuilder<any, any, any, any, any, any, any, any, any>>,
        Type extends string,
        Op extends Operator,
        Qual extends Qualifier,
        Mod,
        Meta extends MetaBase,
        Pat extends string,
        PatAlwaysMatch extends boolean,
        AllowRegex extends boolean,
    >(
        command: CommandBuilder<Called, Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex> |
          Hide<CommandBuilder<Called, Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>, Called>,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        return new ServerCommandAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, {}>(
            (command as CommandBuilder<Called, Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>).options,
        );
    }
}

export class ServerCommandAdapter<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    ServerMeta extends MetaBase,
> {
    options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>;

    constructor(
        options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>,
    ) {
        this.options = options;
    }

    meta<M extends MetaBase>(): ServerCommandAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, M>;
    meta<M extends MetaBase>(meta: M): ServerCommandAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Partial<M>>;

    meta<M extends MetaBase>(meta?: M) {
        if (meta == null) {
            return new ServerCommandAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Meta & M>({
                ...this.options,
                meta: this.options.meta ?? {} as any,
            });
        } else {
            return new ServerCommandAdapter<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Meta & Partial<M>>({
                ...this.options,
                meta: Object.assign(this.options.meta ?? {}, meta) as any,
            });
        }
    }

    handler(handler: ServerAdapterHandlerInput<Op, Qual, Mod, Meta & ServerMeta, Pat, PatAlwaysMatch, AllowRegex>): ServerCommandAdapterHandler<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, ServerMeta> {
        return new ServerCommandAdapterHandler<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, ServerMeta>({
            options: this.options,
            handler,
        });
    }
}

export class ServerCommandAdapterHandler<
    Type extends string,
    Op extends Operator,
    Qual extends Qualifier,
    Mod,
    Meta extends MetaBase,
    Pat extends string,
    PatAlwaysMatch extends boolean,
    AllowRegex extends boolean,
    ServerMeta extends MetaBase,
> {
    options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>;
    handler: ServerAdapterHandlerInput<Op, Qual, Mod, Meta & ServerMeta, Pat, PatAlwaysMatch, AllowRegex>;

    constructor(
        options: {
            options: CommandOption<Type, Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex>;
            handler: ServerAdapterHandlerInput<Op, Qual, Mod, Meta & ServerMeta, Pat, PatAlwaysMatch, AllowRegex>;
        },
    ) {
        this.options = options.options;
        this.handler = options.handler;
    }

    apply<Table>(column: (table: Table) => Column, meta: ServerMeta): ServerCommandHandler<Op, Qual, Mod, Meta, Pat, PatAlwaysMatch, AllowRegex, Table> {
        return (args: ServerCommandHandlerArgs<Op, Qual, Mod, Pat, PatAlwaysMatch, AllowRegex>, ctx: ServerCommandContext<Meta, Table>) => {
            return this.handler(args,
                {
                    meta:   Object.assign({}, (ctx as any).meta ?? {}, meta) as Meta & ServerMeta,
                    column: column(ctx.table),
                    table:  ctx.table,
                } as any,
            );
        };
    }

    call<Table>(
        options: {
            column: (table: Table) => Column;
            args:   ServerCommandHandlerArgs<Op, Qual, Mod, Pat, PatAlwaysMatch, AllowRegex>;
            ctx:    ServerCommandContext<Meta & ServerMeta, Table>;
        },
    ): SQL {
        const { column, args, ctx } = options;

        return this.handler(args, {
            meta:   ((ctx as any).meta ?? {}) as Meta & ServerMeta,
            column: column(ctx.table),
            table:  ctx.table,
        } as any);
    }
}

export const ca = new ServerCommandAdapterCreator();
