/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CommandMapBase, CommandOption, ModelOptions } from '@search/index';
import { CommandInputOption } from '@search/command';
import { ClientCommandOption } from './types';
import { ClientExplainHandler } from './types';
import { ClientCommandAdapterHandler } from './adapter';

import { MetaBase, MetaRest } from '@search/base/meta';
import { Hide, HiddenKeys } from '@search/util/hide';
import { merge } from '@search/util/merge';

export type AdapterBase = ClientCommandAdapterHandler<any, any, any, any>;
export type AdapterMapBase = Record<string, any>;

export type SelectAdapter<
    Adapters extends AdapterMapBase,
    Type extends string,
> = {
    [K in keyof Adapters]: Adapters[K] extends ClientCommandAdapterHandler<infer T, infer _I, infer _MI, infer _MV>
        ? Type extends T
            ? Adapters[K]
            : never
        : never;
}[keyof Adapters];

export type AdapterMeta<Adapter extends AdapterBase> = Adapter extends ClientCommandAdapterHandler<infer _T, infer _I, infer MI, infer MV>
    ? MetaRest<MI, MV>
    : never;

export type ClientCommandMaps<CommandMap extends CommandMapBase, Adapters extends AdapterMapBase> = {
    [K in keyof CommandMap]: CommandMap[K] extends CommandOption<infer Type, infer Input, infer MetaValue>
        ? SelectAdapter<Adapters, Type> extends never
            ? ClientCommandBuilder<Type, Input, MetaValue>
            : ClientCommandBuilderWithAdapter<Type, Input, MetaValue, SelectAdapter<Adapters, Type>>
        : never;
};

export interface ClientCommandBaseOption<
    CommandMap extends CommandMapBase,
    Adapters extends AdapterMapBase,
> {
    commands: CommandMap;
    adapters: Adapters;
}

export class ClientCommandBase<
    Called extends HiddenKeys<ClientCommandBase<any, any, any>>,
    Command extends CommandMapBase,
    Adapters extends AdapterMapBase,
> {
    options: ClientCommandBaseOption<Command, Adapters>;

    constructor(options: ClientCommandBaseOption<Command, Adapters>) {
        this.options = options;
    }

    with<C extends CommandMapBase>(model: ModelOptions<C>): Hide<ClientCommandBase<Called | 'with', C, Adapters>, Called | 'with'> {
        return new ClientCommandBase<Called | 'with', C, Adapters>({
            ...this.options,
            commands: model.commands,
        });
    }

    use<A extends AdapterMapBase>(adapters: A): Hide<ClientCommandBase<Called | 'use', Command, A>, Called | 'use'> {
        return new ClientCommandBase<Called | 'use', Command, A>({
            ...this.options,
            adapters,
        });
    }

    get commands(): ClientCommandMaps<Command, Adapters> {
        return Object.fromEntries(
            Object.entries(this.options.commands).map(([key, option]) => {
                const adapter = Object.values(this.options.adapters).find(a => a.options.type === option.type);

                if (adapter == null) {
                    return [
                        key,
                        new ClientCommandBuilder<any, any, any>({
                            options: option,
                            explain: undefined,
                        }),
                    ];
                } else {
                    return [
                        key,
                        new ClientCommandBuilderWithAdapter<any, any, any, any>({
                            options: option,
                            explain: undefined,
                        }, adapter),
                    ];
                }
            }),
        ) as any;
    }
}

export class ClientCommandBuilder<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
> {
    options: ClientCommandOption<Type, Input, MetaValue>;

    constructor(options: ClientCommandOption<Type, Input, MetaValue>) {
        this.options = options;
    }

    explain(explain: ClientExplainHandler<Input>): ClientCommandOption<Type, Input, MetaValue> {
        return {
            ...this.options,
            explain,
        };
    }
}

export class ClientCommandBuilderWithAdapter<
    Type extends string,
    Input extends CommandInputOption,
    MetaValue extends MetaBase,
    Adapter extends AdapterBase,
> extends ClientCommandBuilder<Type, Input, MetaValue> {
    adapter: Adapter;

    constructor(
        options: ClientCommandOption<Type, Input, MetaValue>,
        adapter: Adapter,
    ) {
        super(options);
        this.adapter = adapter;
    }

    apply(meta: AdapterMeta<Adapter>): ClientCommandOption<Type, Input, MetaValue> {
        const explain = this.adapter.apply(merge(this.options.options.meta, meta));

        return {
            options: this.options.options,
            explain,
        };
    }
}

export const cc = new ClientCommandBase<never, {}, {}>({
    commands: {},
    adapters: {},
});
