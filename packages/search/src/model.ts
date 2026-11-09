import type { Hide, HiddenKeys } from '#search/util/hide';
import type { CommandOption } from './command';
import type { LogicalWitness } from './command';
import { describeLogicalCommand } from './command/semantics';

export type CommandMapBase = Record<string, CommandOption<any, any, any>>;

export interface ModelOptions<Command extends CommandMapBase> {
  id:           string;
  commands:     Command;
  logicalScope: LogicalWitness[];
}

export class ModelBuilder<
  Called extends HiddenKeys<ModelBuilder<any, any>>,
  Command extends CommandMapBase
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

  /** Sets the default identity witnesses shared by this game's query rows. */
  logicalScope(logicalScope: LogicalWitness[]): Hide<ModelBuilder<Called, Command>, 'logicalScope'> {
    return new ModelBuilder<Called, Command>({
      ...this.options,
      logicalScope,
    });
  }

  command<C extends Record<string, CommandOption<any, any, any>>>(commands: C): ModelBuilder<Called, C & Command> {
    const commandsWithId = Object.fromEntries(
      Object.entries(commands).map(([key, option]) => [
        key,
        {
          ...option,
          id:      option.id ?? key,
          logical: describeLogicalCommand(
            option,
            option.logical?.field ?? option.id ?? key,
            option.logical?.witness ?? this.options.logicalScope,
          ),
        },
      ]),
    ) as unknown as C;

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
  id:           '',
  commands:     {},
  logicalScope: [],
});
