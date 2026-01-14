import { CommandMapBase, ModelOptions } from '@search/index';
import { SearchResult } from '@search/schema';
import Parser from '@search/parser';
import { simplify } from '@search/parser/simplify';

import { ServerCommand } from './command';
import { ServerAction } from './action';
import { ServerActionOption, ServerActionResult } from './action/types';
import { translate } from './translate';

export type ServerCommandMapBase<Table> = Record<string, ServerCommand<any, any, any, any, Table>>;

export class ServerModelBuilder {
    from<M extends ModelOptions<CommandMapBase>>(model: M) {
        return new ServerModelBuilderWithSchema<M>(model);
    }
}

export class ServerModelBuilderWithSchema<
    M extends ModelOptions<CommandMapBase>,
> {
    model: M;

    constructor(model: M) {
        this.model = model;
    }

    table<Table>(tables: Table[]) {
        return new ServerModelBuilderWithTable<M, Table>(this.model, tables);
    }
}

export class ServerModelBuilderWithTable<
    M extends ModelOptions<CommandMapBase>,
    Table,
> {
    model:  M;
    tables: Table[];

    constructor(model: M, tables: Table[]) {
        this.model = model;
        this.tables = tables;
    }

    command<C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>>(commands: C) {
        return new ServerModelBuilderWithCommands<M, Table, C>(
            this.model,
            this.tables,
            commands,
        );
    }
}

export class ServerModelBuilderWithCommands<
    M extends ModelOptions<CommandMapBase>,
    Table,
    C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>> {
    model:    M;
    tables:   Table[];
    commands: C;

    constructor(model: M, tables: Table[], commands: C) {
        this.model = model;
        this.tables = tables;
        this.commands = commands;
    }

    action<A extends Record<string, ServerAction<Table, any, any>>>(actions: A) {
        return new ServerModel<M, Table, C, A>(
            this.model,
            this.tables,
            this.commands,
            actions,
        );
    }
}

export class ServerModel<
    M extends ModelOptions<CommandMapBase>,
    Table,
    C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>,
    A extends Record<string, ServerAction<Table, any, any>>,
> {
    model:    M;
    tables:   Table[];
    commands: C;
    actions:  A;

    constructor(model: M, tables: Table[], commands: C, actions: A) {
        this.model = model;
        this.tables = tables;
        this.commands = commands;
        this.actions = actions;
    }

    async search<K extends string & keyof A>(
        actionKey: K,
        text: string,
        options: ServerActionOption<A[K]>,
    ): Promise<SearchResult<ServerActionResult<A[K]>>> {
        const action = this.actions[actionKey];

        if (action == null) {
            return {
                text,
                errors: [{ type: 'unknown-action' }],
            };
        }

        const trimmedText = text.trim();

        if (trimmedText === '') {
            return {
                text,
                errors: [{ type: 'empty-input' }],
            };
        }

        try {
            const expr = new Parser(trimmedText).parse();

            const simplified = simplify(expr);

            const commands = Object.values(this.commands);

            const { query, post } = translate(simplified, commands, action.table);

            if (query == null) {
                return { text, errors: [] };
            }

            const result = await action.handler(query, post, options);

            return { text, errors: [], result };
        } catch (e) {
            console.log(e);

            return { text, errors: [e] };
        }
    }
}

export const ss = new ServerModelBuilder();
