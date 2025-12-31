import { Hide, HiddenKeys } from '@search/util/hide';
import { CommandOption } from './command';

export type CommandMapBase = Record<string, CommandOption<any, any, any>>;

export interface ModelOptions<Command extends CommandMapBase> {
    id:       string;
    commands: Command;
}

export class ModelBuilder<
    Called extends HiddenKeys<ModelBuilder<any, any>>,
    Command extends CommandMapBase,
> {
    options: ModelOptions<Command>;

    constructor(options: ModelOptions<Command>) {
        this.options = options;
    }

    id(id: string): Hide<ModelBuilder<Called | 'id', Command>, 'id'> {
        return new ModelBuilder<Called | 'id', Command>({
            ...this.options,
            id,
        });
    }

    command<C extends Record<string, CommandOption<any, any, any>>>(commands: C): ModelBuilder<Called, C & Command> {
        const commandsWithId = Object.fromEntries(
            Object.entries(commands).map(([key, option]) => [
                key,
                {
                    ...option,
                    id: option.id ?? key,
                },
            ]),
        ) as C;

        return new ModelBuilder<Called, C & Command>({
            ...this.options,
            commands: {
                ...this.options.commands,
                ...commandsWithId,
            },
        });
    }

    done(): ModelOptions<Command> {
        return this.options;
    }
}

export const s = new ModelBuilder({
    id:       '',
    commands: {},
});
