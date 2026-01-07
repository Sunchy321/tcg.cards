import { MetaBase } from '@search/base/meta';
import { CommandInput, CommandInputOption, CommandOption } from '@search/command';

export type I18N = (key: string, named?: Record<string, any>) => string;

export type ClientExplainHandler<Input extends CommandInputOption> = (
    args: CommandInput<Input>,
    i18n: I18N,
) => string | undefined;

export interface ClientCommandOption<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
> {
    options:  CommandOption<Type, Input, MetaValue>;
    explain?: ClientExplainHandler<Input>;
}

export type CommonClientCommandOption = ClientCommandOption<
    string,
    CommandInputOption,
    MetaBase
>;
