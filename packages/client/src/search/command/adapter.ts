/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CommandInput, CommandInputOption } from '@search/command';
import { CommandBuilder, CommandOption } from '@search/index';
import { ClientExplainHandler } from './types';

import { MetaBase, MetaRest } from '@search/base/meta';
import { Merge, merge } from '@search/util/merge';

import { I18N } from './types';

export type ClientAdapterHandlerInput<Input extends CommandInputOption, MetaValue> = (
    args: CommandInput<Input>,
    meta: MetaValue,
    i18n: I18N,
) => string | undefined;

export class ClientCommandAdapterCreator {
    adapt<
        Type extends string,
        Input extends CommandInputOption,
        MetaInput extends MetaBase,
        MetaValue extends MetaBase,
    >(command: CommandBuilder<Type, Input, MetaInput, MetaValue>) {
        return new ClientCommandAdapter<Type, Input, MetaInput, MetaValue>(command.options);
    }
}

export class ClientCommandAdapter<
    Type extends string,
    Input extends CommandInputOption,
    MetaInput extends MetaBase,
    MetaValue extends MetaBase,
> {
    options: CommandOption<Type, Input, MetaValue>;

    constructor(options: CommandOption<Type, Input, MetaValue>) {
        this.options = options;
    }

    $meta<M extends MetaBase>(): ClientCommandAdapter<Type, Input, Merge<MetaInput, M>, MetaValue>;
    $meta<M extends MetaBase>(meta: M): ClientCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>;

    $meta<M extends MetaBase>(meta?: M) {
        if (meta == null) {
            return new ClientCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, {}>>({
                ...this.options,
                meta: merge(this.options.meta, {}),
            });
        } else {
            return new ClientCommandAdapter<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>({
                ...this.options,
                meta: merge(this.options.meta, meta),
            });
        }
    }

    explain(handler: ClientAdapterHandlerInput<Input, MetaInput>) {
        return new ClientCommandAdapterHandler<Type, Input, MetaInput, MetaValue>({
            options: this.options,
            handler,
        });
    }
}

export class ClientCommandAdapterHandler<
    Type extends string,
    Input extends CommandInputOption,
    MetaInput extends MetaBase,
    MetaValue extends MetaBase,
> {
    options: CommandOption<Type, Input, MetaValue>;
    handler: ClientAdapterHandlerInput<Input, MetaInput>;

    constructor(
        options: {
            options: CommandOption<Type, Input, MetaValue>;
            handler: ClientAdapterHandlerInput<Input, MetaInput>;
        },
    ) {
        this.options = options.options;
        this.handler = options.handler;
    }

    apply(meta: MetaRest<MetaInput, MetaValue>): ClientExplainHandler<Input> {
        return (args: CommandInput<Input>, i18n: I18N) => {
            console.log(this.options.id, this.options.meta, meta);

            return this.handler(args, merge(this.options.meta, meta) as MetaInput, i18n);
        };
    }

    call(
        options: {
            args: CommandInput<Input>;
            meta: MetaRest<MetaInput, MetaValue>;
            i18n: I18N;
        },
    ): string | undefined {
        const { args, meta, i18n } = options;

        return this.handler(args, merge(this.options.meta, meta) as MetaInput, i18n);
    }
}

export const ca = new ClientCommandAdapterCreator();
