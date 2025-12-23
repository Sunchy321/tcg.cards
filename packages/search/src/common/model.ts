import { Hide, HiddenKeys } from '@search/util/hide';
import { CommandOption } from './command';

interface ModelOptions<Command> {
    id:       string;
    commands: Command;
}

class ModelBuilder<
    Called extends HiddenKeys<ModelBuilder<any, any>>,
    Command,
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

    command<C extends Record<string, CommandOption<any, any, any, any, any, any>>>(commands: C): ModelBuilder<Called, C & Command> {
        return new ModelBuilder<Called, C & Command>({
            ...this.options,
            commands: {
                ...this.options.commands,
                ...commands,
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
