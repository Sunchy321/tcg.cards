import { MetaBase } from '@search/base/meta';
import { CommandInputOption, CommandOption } from '@search/command';

import { ServerCommandHandler } from './builder';

export interface ServerCommandOption<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Table,
> {
    options: CommandOption<Type, Input, MetaValue>;
    handler: ServerCommandHandler<Input, MetaValue, Table>;
}

export type CommonServerCommandOption = ServerCommandOption<
    string,
    CommandInputOption,
    MetaBase,
    any
>;
